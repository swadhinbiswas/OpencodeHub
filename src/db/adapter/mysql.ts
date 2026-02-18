/**
 * MySQL-compatible Database Adapter
 * Supports MySQL/MariaDB/PlanetScale/TiDB via mysql2
 */

import {
  BaseDatabaseAdapter,
  ColumnType,
  DatabaseConfig,
  Migration,
  MigrationStatus,
  QueryOptions,
  QueryResult,
  TableAlterCommand,
  TableSchema,
} from "./types";

export class MySQLAdapter extends BaseDatabaseAdapter {
  private pool: any;
  private inTransaction = false;
  private transactionClient: any = null;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const mysql = await import("mysql2/promise");

      this.pool = mysql.createPool({
        uri: this.config.url,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        host: this.config.host,
        port: this.config.port,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true,
        connectionLimit: this.config.poolSize || 10,
      });

      await this.pool.query("SELECT 1");
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to MySQL database: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.pool?.end();
    this.connected = false;
  }

  private getClient() {
    return this.transactionClient || this.pool;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...options, limit: 1 });
    return results[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const selectClause = options?.select?.length
      ? options.select.map((s) => `\`${s}\``).join(", ")
      : "*";

    if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error("Invalid table name");

    let sql = `SELECT ${selectClause} FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    if (options?.orderBy?.length) {
      const orderClauses = options.orderBy.map(
        (o) => `\`${o.field}\` ${o.direction.toUpperCase()}`
      );
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const [rows] = await this.getClient().query(sql, params);
    return rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");
    const columns = keys.map((k) => `\`${k}\``).join(", ");

    const sql = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;
    const [result] = await this.getClient().query(sql, values);
    const insertId = result?.insertId;

    if (insertId === undefined || insertId === null) {
      return data as T;
    }
    const created = await this.findById<T>(table, insertId);
    return (created || (data as T));
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const results: T[] = [];
    for (const item of data) {
      const created = await this.create<T>(table, item);
      results.push(created);
    }
    return results;
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ");

    const sql = `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`;
    const [result] = await this.getClient().query(sql, [...values, id]);

    if (!result?.affectedRows) return null;
    return this.findById<T>(table, id);
  }

  async updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ");

    let sql = `UPDATE \`${table}\` SET ${setClause}`;
    const params: unknown[] = [...values];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const [result] = await this.getClient().query(sql, params);
    return result?.affectedRows || 0;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const sql = `DELETE FROM \`${table}\` WHERE id = ?`;
    const [result] = await this.getClient().query(sql, [id]);
    return (result?.affectedRows || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    let sql = `DELETE FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const [result] = await this.getClient().query(sql, params);
    return result?.affectedRows || 0;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const [rows] = await this.getClient().query(sql, params);
    return Number((rows?.[0] as { count?: number })?.count || 0);
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    const [rows] = await this.getClient().query(query, params || []);

    if (Array.isArray(rows)) {
      return {
        rows: rows as T[],
        rowCount: rows.length,
      };
    }

    return {
      rows: [],
      rowCount: rows?.affectedRows || 0,
      lastInsertId: rows?.insertId,
      affectedRows: rows?.affectedRows || 0,
    };
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.transactionClient = await this.pool.getConnection();
    await this.transactionClient.beginTransaction();
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.transactionClient.commit();
    this.transactionClient.release();
    this.transactionClient = null;
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.transactionClient.rollback();
    this.transactionClient.release();
    this.transactionClient = null;
    this.inTransaction = false;
  }

  async tableExists(table: string): Promise<boolean> {
    const [rows] = await this.getClient().query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
      [table]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((col) => {
      let def = `\`${col.name}\` ${this.mapColumnType(col.type)}`;

      if (col.autoIncrement) def += " AUTO_INCREMENT";
      if (!col.nullable) def += " NOT NULL";
      if (col.unique) def += " UNIQUE";
      if (col.defaultValue !== undefined && !col.autoIncrement) {
        def += ` DEFAULT ${this.formatDefaultValue(col.defaultValue)}`;
      }

      return def;
    });

    if (schema.primaryKey) {
      const pk = Array.isArray(schema.primaryKey)
        ? schema.primaryKey.map((c) => `\`${c}\``).join(", ")
        : `\`${schema.primaryKey}\``;
      columnDefs.push(`PRIMARY KEY (${pk})`);
    }

    const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (\n  ${columnDefs.join(",\n  ")}\n)`;
    await this.getClient().query(sql);
  }

  async dropTable(table: string): Promise<void> {
    await this.getClient().query(`DROP TABLE IF EXISTS \`${table}\``);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    for (const change of changes) {
      switch (change.type) {
        case "add_column":
          if (change.column) {
            let def = `\`${change.column.name}\` ${this.mapColumnType(change.column.type)}`;
            if (!change.column.nullable) def += " NOT NULL";
            if (change.column.defaultValue !== undefined) {
              def += ` DEFAULT ${this.formatDefaultValue(change.column.defaultValue)}`;
            }
            await this.getClient().query(`ALTER TABLE \`${table}\` ADD COLUMN ${def}`);
          }
          break;
        case "drop_column":
          if (change.columnName) {
            await this.getClient().query(`ALTER TABLE \`${table}\` DROP COLUMN \`${change.columnName}\``);
          }
          break;
        case "add_index":
          if (change.index) {
            const uniqueStr = change.index.unique ? "UNIQUE " : "";
            const idxCols = change.index.columns.map((c) => `\`${c}\``).join(", ");
            await this.getClient().query(
              `CREATE ${uniqueStr}INDEX \`${change.index.name}\` ON \`${table}\` (${idxCols})`
            );
          }
          break;
        case "drop_index":
          if (change.indexName) {
            await this.getClient().query(`DROP INDEX \`${change.indexName}\` ON \`${table}\``);
          }
          break;
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up(this);
      await this.rawQuery(
        "INSERT INTO `_migrations` (id, name, executed_at) VALUES (?, ?, ?)",
        [migration.id, migration.name, new Date().toISOString()]
      );
      await this.commitTransaction();
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const exists = await this.tableExists("_migrations");
    if (!exists) {
      await this.createTable("_migrations", {
        columns: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "executed_at", type: "datetime", nullable: true },
        ],
        primaryKey: "id",
      });
    }

    const result = await this.rawQuery<{
      id: string;
      name: string;
      executed_at: string | null;
    }>("SELECT * FROM `_migrations` ORDER BY executed_at");

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      executedAt: row.executed_at ? new Date(row.executed_at) : null,
      status: row.executed_at ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    const typeMap: Record<ColumnType, string> = {
      string: "VARCHAR(255)",
      text: "TEXT",
      integer: "INT",
      bigint: "BIGINT",
      float: "FLOAT",
      decimal: "DECIMAL(10,2)",
      boolean: "BOOLEAN",
      date: "DATE",
      datetime: "DATETIME",
      timestamp: "TIMESTAMP",
      json: "JSON",
      blob: "BLOB",
      uuid: "CHAR(36)",
    };
    return typeMap[type] || "TEXT";
  }

  private formatDefaultValue(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "string") return `'${value}'`;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return String(value);
  }
}
