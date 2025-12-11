/**
 * SQLite Database Adapter
 * Supports both better-sqlite3 and Turso/libSQL
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

export class SQLiteAdapter extends BaseDatabaseAdapter {
  private db: any;
  private inTransaction: boolean = false;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Dynamic import for better-sqlite3
      const Database = (await import("better-sqlite3")).default;
      this.db = new Database(this.config.url);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to SQLite database: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.db?.close();
    this.connected = false;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...options, limit: 1 });
    return results[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const selectClause = options?.select?.length
      ? options.select.join(", ")
      : "*";

    let sql = `SELECT ${selectClause} FROM ${table}`;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    if (options?.orderBy?.length) {
      const orderClauses = options.orderBy.map(
        (o) => `${o.field} ${o.direction.toUpperCase()}`
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

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");

    const sql = `INSERT INTO ${table} (${keys.join(
      ", "
    )}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values);

    return this.findById<T>(table, result.lastInsertRowid) as Promise<T>;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const keys = Object.keys(data[0]);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.join(
      ", "
    )}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);

    const insertMany = this.db.transaction((items: Partial<T>[]) => {
      const results: T[] = [];
      for (const item of items) {
        const values = keys.map((k) => (item as any)[k]);
        const result = stmt.run(...values);
        results.push({ id: result.lastInsertRowid, ...item } as T);
      }
      return results;
    });

    return insertMany(data);
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");

    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...values, id);

    if (result.changes === 0) return null;
    return this.findById<T>(table, id);
  }

  async updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");

    let sql = `UPDATE ${table} SET ${setClause}`;
    const params: unknown[] = [...values];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const sql = `DELETE FROM ${table} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    let sql = `DELETE FROM ${table}`;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return result.changes;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const params: unknown[] = [];

    if (options?.where?.length) {
      const whereResult = this.buildWhereConditions(options.where);
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  async rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const stmt = this.db.prepare(query);
    const isSelect = query.trim().toLowerCase().startsWith("select");

    if (isSelect) {
      const rows = params ? stmt.all(...params) : stmt.all();
      return {
        rows: rows as T[],
        rowCount: rows.length,
      };
    } else {
      const result = params ? stmt.run(...params) : stmt.run();
      return {
        rows: [],
        rowCount: result.changes,
        lastInsertId: result.lastInsertRowid,
        affectedRows: result.changes,
      };
    }
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.db.exec("BEGIN TRANSACTION");
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    this.db.exec("COMMIT");
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    this.db.exec("ROLLBACK");
    this.inTransaction = false;
  }

  async tableExists(table: string): Promise<boolean> {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(table);
    return !!result;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((col) => {
      let def = `${col.name} ${this.mapColumnType(col.type)}`;

      if (col.autoIncrement && schema.primaryKey === col.name) {
        def = `${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
      } else {
        if (!col.nullable) def += " NOT NULL";
        if (col.unique) def += " UNIQUE";
        if (col.defaultValue !== undefined) {
          def += ` DEFAULT ${this.formatDefaultValue(col.defaultValue)}`;
        }
      }

      return def;
    });

    // Add primary key constraint if not auto-increment
    const pkCol = schema.columns.find((c) => c.autoIncrement);
    if (schema.primaryKey && !pkCol) {
      const pkFields = Array.isArray(schema.primaryKey)
        ? schema.primaryKey.join(", ")
        : schema.primaryKey;
      columnDefs.push(`PRIMARY KEY (${pkFields})`);
    }

    // Add foreign key constraints
    if (schema.foreignKeys) {
      for (const fk of schema.foreignKeys) {
        const fkCols = fk.columns.join(", ");
        const refCols = fk.references.columns.join(", ");
        let constraint = `FOREIGN KEY (${fkCols}) REFERENCES ${fk.references.table}(${refCols})`;
        if (fk.onDelete)
          constraint += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
        if (fk.onUpdate)
          constraint += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
        columnDefs.push(constraint);
      }
    }

    const sql = `CREATE TABLE IF NOT EXISTS ${table} (\n  ${columnDefs.join(
      ",\n  "
    )}\n)`;
    this.db.exec(sql);

    // Create indexes
    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? "UNIQUE " : "";
        const idxSql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${
          idx.name
        } ON ${table} (${idx.columns.join(", ")})`;
        this.db.exec(idxSql);
      }
    }
  }

  async dropTable(table: string): Promise<void> {
    this.db.exec(`DROP TABLE IF EXISTS ${table}`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    for (const change of changes) {
      switch (change.type) {
        case "add_column":
          if (change.column) {
            let def = `${change.column.name} ${this.mapColumnType(
              change.column.type
            )}`;
            if (!change.column.nullable) def += " NOT NULL";
            if (change.column.defaultValue !== undefined) {
              def += ` DEFAULT ${this.formatDefaultValue(
                change.column.defaultValue
              )}`;
            }
            this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
          }
          break;
        case "drop_column":
          if (change.columnName) {
            this.db.exec(
              `ALTER TABLE ${table} DROP COLUMN ${change.columnName}`
            );
          }
          break;
        case "add_index":
          if (change.index) {
            const uniqueStr = change.index.unique ? "UNIQUE " : "";
            this.db.exec(
              `CREATE ${uniqueStr}INDEX ${
                change.index.name
              } ON ${table} (${change.index.columns.join(", ")})`
            );
          }
          break;
        case "drop_index":
          if (change.indexName) {
            this.db.exec(`DROP INDEX IF EXISTS ${change.indexName}`);
          }
          break;
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up(this);

      // Record migration
      await this.rawQuery(
        `INSERT INTO _migrations (id, name, executed_at) VALUES (?, ?, ?)`,
        [migration.id, migration.name, new Date().toISOString()]
      );

      await this.commitTransaction();
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    // Ensure migrations table exists
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
    }>("SELECT * FROM _migrations ORDER BY executed_at");

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      executedAt: row.executed_at ? new Date(row.executed_at) : null,
      status: row.executed_at ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    const typeMap: Record<ColumnType, string> = {
      string: "TEXT",
      text: "TEXT",
      integer: "INTEGER",
      bigint: "INTEGER",
      float: "REAL",
      decimal: "REAL",
      boolean: "INTEGER",
      date: "TEXT",
      datetime: "TEXT",
      timestamp: "TEXT",
      json: "TEXT",
      blob: "BLOB",
      uuid: "TEXT",
    };
    return typeMap[type] || "TEXT";
  }

  private formatDefaultValue(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "string") return `'${value}'`;
    if (typeof value === "boolean") return value ? "1" : "0";
    return String(value);
  }
}
