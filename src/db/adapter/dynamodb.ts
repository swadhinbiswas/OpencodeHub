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

const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

function toAttr(value: any): any {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttr) };
  if (typeof value === "object") {
    const map: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) map[k] = toAttr(v);
    return { M: map };
  }
  return { S: String(value) };
}

function fromAttr(attr: any): any {
  if (!attr) return undefined;
  if (attr.S !== undefined) return attr.S;
  if (attr.N !== undefined) return Number(attr.N);
  if (attr.BOOL !== undefined) return attr.BOOL;
  if (attr.NULL) return null;
  if (attr.L) return attr.L.map(fromAttr);
  if (attr.M) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(attr.M)) obj[k] = fromAttr(v);
    return obj;
  }
  return undefined;
}

function fromItem(item: Record<string, any>): any {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(item || {})) out[k] = fromAttr(v);
  return out;
}

function toItem(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toAttr(v);
  return out;
}

export class DynamoDBAdapter extends BaseDatabaseAdapter {
  private client: any;
  private commands: any;

  async connect(): Promise<void> {
    if (this.connected) return;
    const mod = await dynamicImport("@aws-sdk/client-dynamodb");
    this.client = new mod.DynamoDBClient({
      endpoint: this.config.host ? `${this.config.ssl ? "https" : "http"}://${this.config.host}${this.config.port ? `:${this.config.port}` : ""}` : undefined,
      region: this.config.options?.region || this.config.database || "us-east-1",
      credentials: this.config.user && this.config.password
        ? { accessKeyId: this.config.user, secretAccessKey: this.config.password }
        : undefined,
    });
    this.commands = mod;
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
    const res = await this.client.send(new this.commands.ScanCommand({
      TableName: table,
      Limit: options?.limit,
    }));
    let rows = (res.Items || []).map(fromItem);
    if (options?.where?.length) {
      rows = rows.filter((row: any) =>
        options.where!.every((w) => {
          switch (w.operator) {
            case "=":
            case "eq":
              return row[w.field] === w.value;
            case "!=":
            case "ne":
              return row[w.field] !== w.value;
            default:
              return true;
          }
        })
      );
    }
    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit) rows = rows.slice(0, options.limit);
    return rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const row = { ...(data as any) };
    if (!row.id) row.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.client.send(new this.commands.PutItemCommand({
      TableName: table,
      Item: toItem(row),
    }));
    return row as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const current = await this.findById<any>(table, id);
    if (!current) return null;
    const next = { ...current, ...(data as any), id: String(id) };
    await this.client.send(new this.commands.PutItemCommand({
      TableName: table,
      Item: toItem(next),
    }));
    return next as T;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) await this.update(table, row.id, data);
    return rows.length;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    await this.client.send(new this.commands.DeleteItemCommand({
      TableName: table,
      Key: { id: { S: String(id) } },
    }));
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
    throw new Error("DynamoDB adapter does not support SQL rawQuery");
  }

  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}

  async tableExists(table: string): Promise<boolean> {
    try {
      await this.client.send(new this.commands.DescribeTableCommand({ TableName: table }));
      return true;
    } catch {
      return false;
    }
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const exists = await this.tableExists(table);
    if (exists) return;
    await this.client.send(new this.commands.CreateTableCommand({
      TableName: table,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
  }

  async dropTable(table: string): Promise<void> {
    if (!(await this.tableExists(table))) return;
    await this.client.send(new this.commands.DeleteTableCommand({ TableName: table }));
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {}

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
    await this.createTable("_migrations", { columns: [{ name: "id", type: "string" }], primaryKey: "id" });
    await this.create("_migrations", {
      id: migration.id,
      name: migration.name,
      executedAt: new Date().toISOString(),
    } as any);
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    if (!(await this.tableExists("_migrations"))) return [];
    const rows = await this.findMany<any>("_migrations");
    return rows.map((row) => ({
      id: row.id,
      name: row.name || row.id,
      executedAt: row.executedAt ? new Date(row.executedAt) : null,
      status: row.executedAt ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    return type;
  }
}
