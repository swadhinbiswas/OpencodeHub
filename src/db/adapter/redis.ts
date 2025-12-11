/**
 * Redis Database Adapter
 * Uses Redis as a document store with JSON support
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
  WhereClause,
} from "./types";

export class RedisAdapter extends BaseDatabaseAdapter {
  private client: any;
  private inTransaction: boolean = false;
  private transactionQueue: any[] = [];

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const { createClient } = await import("redis");
      this.client = createClient({ url: this.config.url });
      this.client.on("error", (err: Error) =>
        console.error("Redis Client Error", err)
      );
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client?.disconnect();
    this.connected = false;
  }

  private getKey(table: string, id: string | number): string {
    return `${table}:${id}`;
  }

  private getIndexKey(table: string): string {
    return `${table}:_index`;
  }

  private getCounterKey(table: string): string {
    return `${table}:_counter`;
  }

  private matchesWhere(doc: any, where?: WhereClause[]): boolean {
    if (!where || where.length === 0) return true;

    for (const clause of where) {
      const value = doc[clause.field];

      switch (clause.operator) {
        case "=":
          if (value !== clause.value) return false;
          break;
        case "!=":
          if (value === clause.value) return false;
          break;
        case ">":
          if (!(value > (clause.value as number))) return false;
          break;
        case "<":
          if (!(value < (clause.value as number))) return false;
          break;
        case ">=":
          if (!(value >= (clause.value as number))) return false;
          break;
        case "<=":
          if (!(value <= (clause.value as number))) return false;
          break;
        case "in":
          if (!(clause.value as unknown[]).includes(value)) return false;
          break;
        case "not in":
          if ((clause.value as unknown[]).includes(value)) return false;
          break;
        case "like":
        case "ilike":
          const pattern = (clause.value as string).replace(/%/g, ".*");
          const flags = clause.operator === "ilike" ? "i" : "";
          if (!new RegExp(`^${pattern}$`, flags).test(value)) return false;
          break;
        case "is null":
          if (value !== null && value !== undefined) return false;
          break;
        case "is not null":
          if (value === null || value === undefined) return false;
          break;
      }
    }

    return true;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...options, limit: 1 });
    return results[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const indexKey = this.getIndexKey(table);
    const ids = await this.client.sMembers(indexKey);

    if (ids.length === 0) return [];

    const keys = ids.map((id: string) => this.getKey(table, id));
    const docs: T[] = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        const doc = JSON.parse(data);
        if (this.matchesWhere(doc, options?.where)) {
          if (options?.select) {
            const selected: any = { id: doc.id };
            for (const field of options.select) {
              selected[field] = doc[field];
            }
            docs.push(selected);
          } else {
            docs.push(doc);
          }
        }
      }
    }

    // Apply sorting
    if (options?.orderBy?.length) {
      docs.sort((a: any, b: any) => {
        for (const order of options.orderBy!) {
          const aVal = a[order.field];
          const bVal = b[order.field];
          if (aVal < bVal) return order.direction === "asc" ? -1 : 1;
          if (aVal > bVal) return order.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    // Apply offset and limit
    let result = docs;
    if (options?.offset) {
      result = result.slice(options.offset);
    }
    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async findById<T>(table: string, id: string | number): Promise<T | null> {
    const key = this.getKey(table, id);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const counterKey = this.getCounterKey(table);
    const id = (data as any).id || (await this.client.incr(counterKey));

    const doc = { id, ...data };
    const key = this.getKey(table, id);

    await this.client.set(key, JSON.stringify(doc));
    await this.client.sAdd(this.getIndexKey(table), String(id));

    return doc as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const results: T[] = [];
    for (const item of data) {
      results.push(await this.create<T>(table, item));
    }
    return results;
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const existing = await this.findById<T>(table, id);
    if (!existing) return null;

    const updated = { ...existing, ...data, id };
    const key = this.getKey(table, id);
    await this.client.set(key, JSON.stringify(updated));

    return updated as T;
  }

  async updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number> {
    const docs = await this.findMany<T>(table, options);
    let count = 0;

    for (const doc of docs) {
      const id = (doc as any).id;
      if (id) {
        await this.update<T>(table, id, data);
        count++;
      }
    }

    return count;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const key = this.getKey(table, id);
    const deleted = await this.client.del(key);
    if (deleted) {
      await this.client.sRem(this.getIndexKey(table), String(id));
    }
    return deleted > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    if (!options?.where?.length) {
      // Delete all
      const ids = await this.client.sMembers(this.getIndexKey(table));
      let count = 0;
      for (const id of ids) {
        if (await this.delete(table, id)) count++;
      }
      return count;
    }

    const docs = await this.findMany(table, options);
    let count = 0;
    for (const doc of docs) {
      const id = (doc as any).id;
      if (id && (await this.delete(table, id))) count++;
    }
    return count;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    if (!options?.where?.length) {
      return this.client.sCard(this.getIndexKey(table));
    }
    const docs = await this.findMany(table, options);
    return docs.length;
  }

  async rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    // Execute raw Redis commands
    const args = query.split(" ");
    const command = args.shift()?.toUpperCase();
    const result = await this.client.sendCommand([
      command,
      ...args,
      ...(params || []),
    ]);

    return {
      rows: Array.isArray(result) ? result : [result],
      rowCount: Array.isArray(result) ? result.length : 1,
    };
  }

  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
    this.transactionQueue = [];
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;

    const multi = this.client.multi();
    for (const cmd of this.transactionQueue) {
      multi[cmd.method](...cmd.args);
    }
    await multi.exec();

    this.inTransaction = false;
    this.transactionQueue = [];
  }

  async rollbackTransaction(): Promise<void> {
    this.inTransaction = false;
    this.transactionQueue = [];
  }

  async tableExists(table: string): Promise<boolean> {
    const exists = await this.client.exists(this.getIndexKey(table));
    return exists > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    // Redis doesn't have tables, but we initialize the index set
    await this.client.sAdd(this.getIndexKey(table), "_init");
    await this.client.sRem(this.getIndexKey(table), "_init");

    // Store schema metadata
    await this.client.set(`${table}:_schema`, JSON.stringify(schema));
  }

  async dropTable(table: string): Promise<void> {
    const ids = await this.client.sMembers(this.getIndexKey(table));
    for (const id of ids) {
      await this.client.del(this.getKey(table, id));
    }
    await this.client.del(this.getIndexKey(table));
    await this.client.del(this.getCounterKey(table));
    await this.client.del(`${table}:_schema`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    // Redis is schema-less, so we just update the stored schema metadata
    const schemaData = await this.client.get(`${table}:_schema`);
    if (schemaData) {
      const schema = JSON.parse(schemaData) as TableSchema;

      for (const change of changes) {
        switch (change.type) {
          case "add_column":
            if (change.column) {
              schema.columns.push(change.column);
            }
            break;
          case "drop_column":
            if (change.columnName) {
              schema.columns = schema.columns.filter(
                (c) => c.name !== change.columnName
              );
            }
            break;
        }
      }

      await this.client.set(`${table}:_schema`, JSON.stringify(schema));
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);

    await this.create("_migrations", {
      id: migration.id,
      name: migration.name,
      executed_at: new Date().toISOString(),
    });
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const migrations = await this.findMany<{
      id: string;
      name: string;
      executed_at: string | null;
    }>("_migrations", {
      orderBy: [{ field: "executed_at", direction: "asc" }],
    });

    return migrations.map((m) => ({
      id: m.id,
      name: m.name,
      executedAt: m.executed_at ? new Date(m.executed_at) : null,
      status: m.executed_at ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    return type; // Redis stores JSON, so types are preserved
  }
}
