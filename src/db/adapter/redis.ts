import crypto from "node:crypto";
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

function applyWhere<T extends Record<string, any>>(rows: T[], where?: WhereClause[]): T[] {
  if (!where?.length) return rows;
  return rows.filter((row) =>
    where.every((clause) => {
      const value = row[clause.field];
      const clauseValue = clause.value as any;
      switch (clause.operator) {
        case "=":
        case "eq":
          return value === clauseValue;
        case "!=":
        case "ne":
          return value !== clauseValue;
        case ">":
        case "gt":
          return value > clauseValue;
        case ">=":
        case "gte":
          return value >= clauseValue;
        case "<":
        case "lt":
          return value < clauseValue;
        case "<=":
        case "lte":
          return value <= clauseValue;
        case "in":
          return Array.isArray(clause.value) && clause.value.includes(value);
        case "not in":
          return Array.isArray(clause.value) && !clause.value.includes(value);
        case "is null":
        case "isNull":
          return value == null;
        case "is not null":
        case "isNotNull":
          return value != null;
        case "like":
        case "ilike":
          return String(value ?? "").toLowerCase().includes(String(clause.value).toLowerCase());
        default:
          return true;
      }
    })
  );
}

export class RedisAdapter extends BaseDatabaseAdapter {
  private redis: any;
  private keyPrefix = "db";

  async connect(): Promise<void> {
    if (this.connected) return;
    const mod = await import("ioredis");
    const Redis = mod.default;
    this.redis = new Redis(this.config.url);
    await this.redis.ping();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.redis.quit();
    this.connected = false;
  }

  private rowKey(table: string, id: string | number) {
    return `${this.keyPrefix}:${table}:row:${id}`;
  }

  private idsKey(table: string) {
    return `${this.keyPrefix}:${table}:ids`;
  }

  private tableMetaKey(table: string) {
    return `${this.keyPrefix}:${table}:meta`;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const rows = await this.findMany<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const ids = await this.redis.smembers(this.idsKey(table));
    const rows: T[] = [];

    for (const id of ids) {
      const raw = await this.redis.get(this.rowKey(table, id));
      if (!raw) continue;
      rows.push(JSON.parse(raw));
    }

    let filtered = applyWhere(rows as any[], options?.where);

    if (options?.orderBy?.length) {
      filtered.sort((a: any, b: any) => {
        for (const rule of options.orderBy!) {
          if (a[rule.field] === b[rule.field]) continue;
          const cmp = a[rule.field] > b[rule.field] ? 1 : -1;
          return rule.direction === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }

    if (options?.offset) filtered = filtered.slice(options.offset);
    if (options?.limit) filtered = filtered.slice(0, options.limit);

    return filtered as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const id =
      (data as any).id ||
      (typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const row = { ...(data as any), id };
    await this.redis.multi()
      .set(this.rowKey(table, id), JSON.stringify(row))
      .sadd(this.idsKey(table), String(id))
      .exec();

    return row as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const key = this.rowKey(table, id);
    const currentRaw = await this.redis.get(key);
    if (!currentRaw) return null;
    const current = JSON.parse(currentRaw);
    const next = { ...current, ...(data as any), id: current.id ?? id };
    await this.redis.set(key, JSON.stringify(next));
    return next as T;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      await this.update(table, row.id, data);
    }
    return rows.length;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const [deleted] = await this.redis.multi()
      .del(this.rowKey(table, id))
      .srem(this.idsKey(table), String(id))
      .exec();
    return (deleted?.[1] || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      await this.delete(table, row.id);
    }
    return rows.length;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    if (!options?.where?.length) {
      return this.redis.scard(this.idsKey(table));
    }
    const rows = await this.findMany<any>(table, options);
    return rows.length;
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    throw new Error("Redis adapter does not support SQL rawQuery");
  }

  async beginTransaction(): Promise<void> {
    // No-op for this adapter abstraction layer.
  }

  async commitTransaction(): Promise<void> {
    // No-op for this adapter abstraction layer.
  }

  async rollbackTransaction(): Promise<void> {
    // No-op for this adapter abstraction layer.
  }

  async tableExists(table: string): Promise<boolean> {
    const exists = await this.redis.exists(this.tableMetaKey(table));
    return exists === 1;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    await this.redis.set(this.tableMetaKey(table), JSON.stringify(schema));
  }

  async dropTable(table: string): Promise<void> {
    const ids = await this.redis.smembers(this.idsKey(table));
    const multi = this.redis.multi();
    for (const id of ids) {
      multi.del(this.rowKey(table, id));
    }
    multi.del(this.idsKey(table));
    multi.del(this.tableMetaKey(table));
    await multi.exec();
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    const raw = await this.redis.get(this.tableMetaKey(table));
    const schema: TableSchema = raw ? JSON.parse(raw) : { columns: [] };
    for (const change of changes) {
      if (change.type === "add_column" && change.column) {
        schema.columns.push(change.column);
      }
      if (change.type === "drop_column" && change.columnName) {
        schema.columns = schema.columns.filter((c) => c.name !== change.columnName);
      }
    }
    await this.redis.set(this.tableMetaKey(table), JSON.stringify(schema));
  }

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
    await this.redis.hset(`${this.keyPrefix}:_migrations`, migration.id, JSON.stringify({
      id: migration.id,
      name: migration.name,
      executedAt: new Date().toISOString(),
    }));
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const raw = await this.redis.hgetall(`${this.keyPrefix}:_migrations`);
    return Object.values(raw).map((v: any) => {
      const row = JSON.parse(v);
      return {
        id: row.id,
        name: row.name,
        executedAt: row.executedAt ? new Date(row.executedAt) : null,
        status: row.executedAt ? "executed" : "pending",
      } as MigrationStatus;
    });
  }

  protected mapColumnType(type: ColumnType): string {
    return type;
  }
}
