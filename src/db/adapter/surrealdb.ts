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

function buildWhere(where?: WhereClause[]): { sql: string; params: Record<string, any> } {
  if (!where?.length) return { sql: "", params: {} };
  const parts: string[] = [];
  const params: Record<string, any> = {};
  where.forEach((w, i) => {
    const k = `p${i}`;
    params[k] = w.value;
    switch (w.operator) {
      case "=":
      case "eq":
        parts.push(`${w.field} = $${k}`);
        break;
      case "!=":
      case "ne":
        parts.push(`${w.field} != $${k}`);
        break;
      case ">":
      case "gt":
        parts.push(`${w.field} > $${k}`);
        break;
      case ">=":
      case "gte":
        parts.push(`${w.field} >= $${k}`);
        break;
      case "<":
      case "lt":
        parts.push(`${w.field} < $${k}`);
        break;
      case "<=":
      case "lte":
        parts.push(`${w.field} <= $${k}`);
        break;
      default:
        break;
    }
  });
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

export class SurrealDBAdapter extends BaseDatabaseAdapter {
  private db: any;

  async connect(): Promise<void> {
    if (this.connected) return;

    let mod: any;
    try {
      mod = await dynamicImport("surrealdb");
    } catch {
      mod = await dynamicImport("surrealdb.js");
    }

    const Surreal = mod.Surreal || mod.default || mod;
    this.db = new Surreal();

    await this.db.connect(this.config.url);
    if (this.config.user && this.config.password) {
      await this.db.signin({ user: this.config.user, pass: this.config.password });
    }
    await this.db.use({
      namespace: (this.config.options?.namespace as string) || "opencodehub",
      database: this.config.database || "opencodehub",
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    if (this.db?.close) await this.db.close();
    this.connected = false;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const rows = await this.findMany<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const where = buildWhere(options?.where);
    const limit = options?.limit ? ` LIMIT ${options.limit}` : "";
    const query = `SELECT * FROM ${table}${where.sql}${limit};`;
    const result = await this.db.query(query, where.params);
    const rows = result?.[0]?.result || [];
    return rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const row: any = { ...(data as any) };
    if (!row.id) row.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await this.db.create(`${table}:${row.id}`, row);
    return (Array.isArray(result) ? result[0] : result) as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const result = await this.db.merge(`${table}:${id}`, data as any);
    return (Array.isArray(result) ? result[0] : result) as T;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      await this.update(table, row.id || row?.id?.id || row?.id?.toString?.() || "", data);
    }
    return rows.length;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    await this.db.delete(`${table}:${id}`);
    return true;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      const id = row.id || row?.id?.id || row?.id?.toString?.();
      if (id) await this.delete(table, id);
    }
    return rows.length;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    return rows.length;
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    const bindings = (params as Record<string, any>) || {};
    const result = await this.db.query(query, bindings);
    const rows = result?.[0]?.result || [];
    return {
      rows: rows as T[],
      rowCount: rows.length,
    };
  }

  async beginTransaction(): Promise<void> {
    await this.db.query("BEGIN TRANSACTION;");
  }

  async commitTransaction(): Promise<void> {
    await this.db.query("COMMIT TRANSACTION;");
  }

  async rollbackTransaction(): Promise<void> {
    await this.db.query("CANCEL TRANSACTION;");
  }

  async tableExists(table: string): Promise<boolean> {
    try {
      await this.db.query(`INFO FOR TABLE ${table};`);
      return true;
    } catch {
      return false;
    }
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    await this.db.query(`DEFINE TABLE ${table} SCHEMALESS;`);
  }

  async dropTable(table: string): Promise<void> {
    await this.db.query(`REMOVE TABLE ${table};`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {}

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    return [];
  }

  protected mapColumnType(type: ColumnType): string {
    return type;
  }
}
