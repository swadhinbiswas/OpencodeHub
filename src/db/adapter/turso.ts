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

export class TursoAdapter extends BaseDatabaseAdapter {
  private client: any;
  private inTransaction = false;

  async connect(): Promise<void> {
    if (this.connected) return;
    const libsql = await import("@libsql/client");
    this.client = libsql.createClient({
      url: this.config.url,
      authToken: this.config.authToken,
    });
    await this.client.execute("SELECT 1");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const rows = await this.findMany<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const selectClause = options?.select?.length ? options.select.join(", ") : "*";
    let sql = `SELECT ${selectClause} FROM ${table}`;
    const args: unknown[] = [];

    if (options?.where?.length) {
      const where = this.buildWhereConditions(options.where);
      sql += ` ${where.sql}`;
      args.push(...where.params);
    }
    if (options?.orderBy?.length) {
      sql += ` ORDER BY ${options.orderBy.map((o) => `${o.field} ${o.direction.toUpperCase()}`).join(", ")}`;
    }
    if (options?.limit) {
      sql += " LIMIT ?";
      args.push(options.limit);
    }
    if (options?.offset) {
      sql += " OFFSET ?";
      args.push(options.offset);
    }

    const result = await this.client.execute({ sql, args });
    return (result.rows || []) as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
    const result = await this.client.execute({ sql, args: values });
    const insertId = result.lastInsertRowid;
    if (insertId !== undefined && insertId !== null) {
      const found = await this.findById<T>(table, Number(insertId));
      if (found) return found;
    }
    return { ...(data as T) };
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const results: T[] = [];
    for (const item of data) results.push(await this.create<T>(table, item));
    return results;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    await this.client.execute({ sql, args: [...values, id] });
    return this.findById<T>(table, id);
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    let sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")}`;
    const args: unknown[] = [...values];
    if (options?.where?.length) {
      const where = this.buildWhereConditions(options.where);
      sql += ` ${where.sql}`;
      args.push(...where.params);
    }
    const result = await this.client.execute({ sql, args });
    return result.rowsAffected || 0;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const result = await this.client.execute({
      sql: `DELETE FROM ${table} WHERE id = ?`,
      args: [id],
    });
    return (result.rowsAffected || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    let sql = `DELETE FROM ${table}`;
    const args: unknown[] = [];
    if (options?.where?.length) {
      const where = this.buildWhereConditions(options.where);
      sql += ` ${where.sql}`;
      args.push(...where.params);
    }
    const result = await this.client.execute({ sql, args });
    return result.rowsAffected || 0;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    const args: unknown[] = [];
    if (options?.where?.length) {
      const where = this.buildWhereConditions(options.where);
      sql += ` ${where.sql}`;
      args.push(...where.params);
    }
    const result = await this.client.execute({ sql, args });
    return Number(result.rows?.[0]?.count || 0);
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.client.execute({ sql: query, args: params || [] });
    return {
      rows: (result.rows || []) as T[],
      rowCount: result.rows?.length || result.rowsAffected || 0,
      lastInsertId: result.lastInsertRowid,
      affectedRows: result.rowsAffected || 0,
    };
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    await this.client.execute("BEGIN");
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.client.execute("COMMIT");
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.client.execute("ROLLBACK");
    this.inTransaction = false;
  }

  async tableExists(table: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      args: [table],
    });
    return (result.rows?.length || 0) > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((col) => {
      let def = `${col.name} ${this.mapColumnType(col.type)}`;
      if (col.autoIncrement && schema.primaryKey === col.name) {
        def = `${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
      } else {
        if (!col.nullable) def += " NOT NULL";
        if (col.unique) def += " UNIQUE";
      }
      return def;
    });
    if (schema.primaryKey && !schema.columns.some((c) => c.autoIncrement)) {
      const pk = Array.isArray(schema.primaryKey) ? schema.primaryKey.join(", ") : schema.primaryKey;
      columnDefs.push(`PRIMARY KEY (${pk})`);
    }
    await this.client.execute(`CREATE TABLE IF NOT EXISTS ${table} (${columnDefs.join(", ")})`);
  }

  async dropTable(table: string): Promise<void> {
    await this.client.execute(`DROP TABLE IF EXISTS ${table}`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    for (const change of changes) {
      if (change.type === "add_column" && change.column) {
        await this.client.execute(
          `ALTER TABLE ${table} ADD COLUMN ${change.column.name} ${this.mapColumnType(change.column.type)}`
        );
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up(this);
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
    const result = await this.rawQuery<{ id: string; name: string; executed_at: string | null }>(
      "SELECT * FROM _migrations ORDER BY executed_at"
    );
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
}
