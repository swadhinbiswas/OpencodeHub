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
  WhereClause,
} from "./types";

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

function buildWhere(where?: WhereClause[]): { sql: string; params: unknown[] } {
  if (!where?.length) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const w of where) {
    switch (w.operator) {
      case "=":
      case "eq":
        parts.push(`${w.field} = ?`);
        params.push(w.value);
        break;
      case "!=":
      case "ne":
        parts.push(`${w.field} != ?`);
        params.push(w.value);
        break;
      case ">":
      case "gt":
        parts.push(`${w.field} > ?`);
        params.push(w.value);
        break;
      case ">=":
      case "gte":
        parts.push(`${w.field} >= ?`);
        params.push(w.value);
        break;
      case "<":
      case "lt":
        parts.push(`${w.field} < ?`);
        params.push(w.value);
        break;
      case "<=":
      case "lte":
        parts.push(`${w.field} <= ?`);
        params.push(w.value);
        break;
      default:
        break;
    }
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

export class CassandraAdapter extends BaseDatabaseAdapter {
  protected client: any;

  async connect(): Promise<void> {
    if (this.connected) return;
    const cassandra = await dynamicImport("cassandra-driver");
    const url = new URL(this.config.url);
    this.client = new cassandra.Client({
      contactPoints: [url.hostname || this.config.host || "127.0.0.1"],
      localDataCenter: (this.config.options?.localDataCenter as string) || "datacenter1",
      keyspace: this.config.database || url.pathname.replace(/^\//, "") || "opencodehub",
      credentials: this.config.user && this.config.password
        ? new cassandra.auth.PlainTextAuthProvider(this.config.user, this.config.password)
        : undefined,
    });
    await this.client.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.shutdown();
    this.connected = false;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const rows = await this.findMany<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    let sql = `SELECT * FROM ${table}`;
    const where = buildWhere(options?.where);
    sql += where.sql;
    if (options?.limit) sql += ` LIMIT ${options.limit}`;
    const result = await this.client.execute(sql, where.params, { prepare: true });
    return result.rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const row = { ...(data as any) };
    if (!row.id) row.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
    await this.client.execute(sql, keys.map((k) => row[k]), { prepare: true });
    return row as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data);
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
    await this.client.execute(sql, [...keys.map((k) => (data as any)[k]), String(id)], { prepare: true });
    return this.findById<T>(table, id);
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) await this.update(table, row.id, data);
    return rows.length;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    await this.client.execute(`DELETE FROM ${table} WHERE id = ?`, [String(id)], { prepare: true });
    return true;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) await this.delete(table, row.id);
    return rows.length;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    return rows.length;
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.client.execute(query, params || [], { prepare: true });
    return {
      rows: result.rows as T[],
      rowCount: result.rows.length,
    };
  }

  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}

  async tableExists(table: string): Promise<boolean> {
    const result = await this.client.execute(
      "SELECT table_name FROM system_schema.tables WHERE keyspace_name = ? AND table_name = ?",
      [this.config.database, table],
      { prepare: true }
    );
    return result.rows.length > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((c) => `${c.name} ${this.mapColumnType(c.type)}`);
    const pk = Array.isArray(schema.primaryKey)
      ? schema.primaryKey.join(", ")
      : schema.primaryKey || "id";
    await this.client.execute(
      `CREATE TABLE IF NOT EXISTS ${table} (${columnDefs.join(", ")}, PRIMARY KEY (${pk}))`
    );
  }

  async dropTable(table: string): Promise<void> {
    await this.client.execute(`DROP TABLE IF EXISTS ${table}`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    for (const change of changes) {
      if (change.type === "add_column" && change.column) {
        await this.client.execute(
          `ALTER TABLE ${table} ADD ${change.column.name} ${this.mapColumnType(change.column.type)}`
        );
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    return [];
  }

  protected mapColumnType(type: ColumnType): string {
    const map: Record<ColumnType, string> = {
      string: "text",
      text: "text",
      integer: "int",
      bigint: "bigint",
      float: "float",
      decimal: "decimal",
      boolean: "boolean",
      date: "date",
      datetime: "timestamp",
      timestamp: "timestamp",
      json: "text",
      blob: "blob",
      uuid: "uuid",
    };
    return map[type] || "text";
  }
}
