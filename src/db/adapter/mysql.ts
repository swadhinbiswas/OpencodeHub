/**
 * MySQL Database Adapter
 * Supports MySQL, MariaDB, TiDB, and compatible databases
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
  private connection: any;
  private inTransaction: boolean = false;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const mysql = await import("mysql2/promise");
      this.pool = mysql.createPool({
        uri: this.config.url,
        waitForConnections: true,
        connectionLimit: this.config.poolSize || 10,
      });

      // Test connection
      const conn = await this.pool.getConnection();
      conn.release();
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to MySQL: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.pool?.end();
    this.connected = false;
  }

  private async getConnection() {
    if (this.connection) return this.connection;
    return this.pool;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...options, limit: 1 });
    return results[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const selectClause = options?.select?.length
      ? options.select.map((s) => `\`${s}\``).join(", ")
      : "*";

    let sql = `SELECT ${selectClause} FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const conditions: string[] = [];
      for (const clause of options.where) {
        switch (clause.operator) {
          case "is null":
            conditions.push(`\`${clause.field}\` IS NULL`);
            break;
          case "is not null":
            conditions.push(`\`${clause.field}\` IS NOT NULL`);
            break;
          case "in":
          case "not in":
            const values = clause.value as unknown[];
            const placeholders = values.map(() => "?").join(", ");
            conditions.push(
              `\`${
                clause.field
              }\` ${clause.operator.toUpperCase()} (${placeholders})`
            );
            params.push(...values);
            break;
          case "ilike":
            conditions.push(`LOWER(\`${clause.field}\`) LIKE LOWER(?)`);
            params.push(clause.value);
            break;
          default:
            conditions.push(`\`${clause.field}\` ${clause.operator} ?`);
            params.push(clause.value);
        }
      }
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    if (options?.orderBy?.length) {
      const orderClauses = options.orderBy.map(
        (o) => `\`${o.field}\` ${o.direction.toUpperCase()}`
      );
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const conn = await this.getConnection();
    const [rows] = await conn.execute(sql, params);
    return rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");
    const columns = keys.map((k) => `\`${k}\``).join(", ");

    const sql = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;
    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, values);

    const insertId = (result as any).insertId;
    if (insertId) {
      return this.findById<T>(table, insertId) as Promise<T>;
    }
    return { ...data, id: insertId } as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const keys = Object.keys(data[0]);
    const columns = keys.map((k) => `\`${k}\``).join(", ");

    const allValues: unknown[] = [];
    const valueGroups: string[] = [];

    for (const item of data) {
      const placeholders = keys.map(() => "?").join(", ");
      valueGroups.push(`(${placeholders})`);
      allValues.push(...keys.map((k) => (item as any)[k]));
    }

    const sql = `INSERT INTO \`${table}\` (${columns}) VALUES ${valueGroups.join(
      ", "
    )}`;
    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, allValues);

    const firstId = (result as any).insertId;
    const inserted: T[] = [];
    for (let i = 0; i < data.length; i++) {
      inserted.push({ ...data[i], id: firstId + i } as T);
    }
    return inserted;
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ");

    const sql = `UPDATE \`${table}\` SET ${setClause} WHERE \`id\` = ?`;
    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, [...values, id]);

    if ((result as any).affectedRows === 0) return null;
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
      const conditions = options.where.map(
        (c) => `\`${c.field}\` ${c.operator} ?`
      );
      sql += ` WHERE ${conditions.join(" AND ")}`;
      params.push(...options.where.map((c) => c.value));
    }

    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, params);
    return (result as any).affectedRows || 0;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const sql = `DELETE FROM \`${table}\` WHERE \`id\` = ?`;
    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, [id]);
    return (result as any).affectedRows > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    let sql = `DELETE FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const conditions = options.where.map(
        (c) => `\`${c.field}\` ${c.operator} ?`
      );
      sql += ` WHERE ${conditions.join(" AND ")}`;
      params.push(...options.where.map((c) => c.value));
    }

    const conn = await this.getConnection();
    const [result] = await conn.execute(sql, params);
    return (result as any).affectedRows || 0;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM \`${table}\``;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const conditions = options.where.map(
        (c) => `\`${c.field}\` ${c.operator} ?`
      );
      sql += ` WHERE ${conditions.join(" AND ")}`;
      params.push(...options.where.map((c) => c.value));
    }

    const conn = await this.getConnection();
    const [rows] = await conn.execute(sql, params);
    return (rows as any)[0].count;
  }

  async rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const conn = await this.getConnection();
    const [rows, fields] = await conn.execute(query, params);

    if (Array.isArray(rows)) {
      return {
        rows: rows as T[],
        rowCount: rows.length,
      };
    }

    return {
      rows: [],
      rowCount: (rows as any).affectedRows || 0,
      lastInsertId: (rows as any).insertId,
      affectedRows: (rows as any).affectedRows,
    };
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.connection.commit();
    this.connection.release();
    this.connection = null;
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.connection.rollback();
    this.connection.release();
    this.connection = null;
    this.inTransaction = false;
  }

  async tableExists(table: string): Promise<boolean> {
    const conn = await this.getConnection();
    const [rows] = await conn.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_NAME = ?`,
      [table]
    );
    return (rows as any[]).length > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((col) => {
      let def = `\`${col.name}\` ${this.mapColumnType(col.type)}`;

      if (col.autoIncrement) {
        def += " AUTO_INCREMENT";
      }

      if (!col.nullable) def += " NOT NULL";
      if (col.unique && !col.autoIncrement) def += " UNIQUE";
      if (col.defaultValue !== undefined && !col.autoIncrement) {
        def += ` DEFAULT ${this.formatDefaultValue(
          col.defaultValue,
          col.type
        )}`;
      }

      return def;
    });

    // Add primary key constraint
    if (schema.primaryKey) {
      const pkFields = Array.isArray(schema.primaryKey)
        ? schema.primaryKey.map((f) => `\`${f}\``).join(", ")
        : `\`${schema.primaryKey}\``;
      columnDefs.push(`PRIMARY KEY (${pkFields})`);
    }

    // Add foreign key constraints
    if (schema.foreignKeys) {
      for (const fk of schema.foreignKeys) {
        const fkCols = fk.columns.map((c) => `\`${c}\``).join(", ");
        const refCols = fk.references.columns.map((c) => `\`${c}\``).join(", ");
        let constraint = `FOREIGN KEY (${fkCols}) REFERENCES \`${fk.references.table}\`(${refCols})`;
        if (fk.onDelete)
          constraint += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
        if (fk.onUpdate)
          constraint += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
        columnDefs.push(constraint);
      }
    }

    const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (\n  ${columnDefs.join(
      ",\n  "
    )}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
    const conn = await this.getConnection();
    await conn.execute(sql);

    // Create indexes
    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? "UNIQUE " : "";
        const cols = idx.columns.map((c) => `\`${c}\``).join(", ");
        const idxSql = `CREATE ${uniqueStr}INDEX \`${idx.name}\` ON \`${table}\` (${cols})`;
        try {
          await conn.execute(idxSql);
        } catch (e) {
          // Index might already exist
        }
      }
    }
  }

  async dropTable(table: string): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    const conn = await this.getConnection();

    for (const change of changes) {
      switch (change.type) {
        case "add_column":
          if (change.column) {
            let def = `\`${change.column.name}\` ${this.mapColumnType(
              change.column.type
            )}`;
            if (!change.column.nullable) def += " NOT NULL";
            if (change.column.defaultValue !== undefined) {
              def += ` DEFAULT ${this.formatDefaultValue(
                change.column.defaultValue,
                change.column.type
              )}`;
            }
            await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${def}`);
          }
          break;
        case "drop_column":
          if (change.columnName) {
            await conn.execute(
              `ALTER TABLE \`${table}\` DROP COLUMN \`${change.columnName}\``
            );
          }
          break;
        case "add_index":
          if (change.index) {
            const uniqueStr = change.index.unique ? "UNIQUE " : "";
            const cols = change.index.columns.map((c) => `\`${c}\``).join(", ");
            await conn.execute(
              `CREATE ${uniqueStr}INDEX \`${change.index.name}\` ON \`${table}\` (${cols})`
            );
          }
          break;
        case "drop_index":
          if (change.indexName) {
            await conn.execute(
              `DROP INDEX \`${change.indexName}\` ON \`${table}\``
            );
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
        `INSERT INTO \`_migrations\` (\`id\`, \`name\`, \`executed_at\`) VALUES (?, ?, ?)`,
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
    }>("SELECT * FROM `_migrations` ORDER BY `executed_at`");

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
      boolean: "TINYINT(1)",
      date: "DATE",
      datetime: "DATETIME",
      timestamp: "TIMESTAMP",
      json: "JSON",
      blob: "BLOB",
      uuid: "CHAR(36)",
    };
    return typeMap[type] || "TEXT";
  }

  private formatDefaultValue(value: unknown, type: ColumnType): string {
    if (value === null) return "NULL";
    if (type === "boolean") return value ? "1" : "0";
    if (typeof value === "string") return `'${value}'`;
    if (type === "json") return `'${JSON.stringify(value)}'`;
    return String(value);
  }
}
