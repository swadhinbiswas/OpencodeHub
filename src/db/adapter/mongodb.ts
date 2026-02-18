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

function toMongoFilter(where?: WhereClause[]): Record<string, unknown> {
  if (!where?.length) return {};
  const filter: Record<string, unknown> = {};

  for (const clause of where) {
    const field = clause.field === "id" ? "_id" : clause.field;
    switch (clause.operator) {
      case "=":
      case "eq":
        filter[field] = clause.value;
        break;
      case "!=":
      case "ne":
        filter[field] = { $ne: clause.value };
        break;
      case ">":
      case "gt":
        filter[field] = { $gt: clause.value };
        break;
      case ">=":
      case "gte":
        filter[field] = { $gte: clause.value };
        break;
      case "<":
      case "lt":
        filter[field] = { $lt: clause.value };
        break;
      case "<=":
      case "lte":
        filter[field] = { $lte: clause.value };
        break;
      case "in":
        filter[field] = { $in: Array.isArray(clause.value) ? clause.value : [clause.value] };
        break;
      case "not in":
        filter[field] = { $nin: Array.isArray(clause.value) ? clause.value : [clause.value] };
        break;
      case "like":
      case "ilike":
        filter[field] = { $regex: String(clause.value), $options: "i" };
        break;
      case "is null":
      case "isNull":
        filter[field] = null;
        break;
      case "is not null":
      case "isNotNull":
        filter[field] = { $ne: null };
        break;
      default:
        break;
    }
  }

  return filter;
}

function normalizeDoc<T>(doc: any): T {
  if (!doc) return doc;
  if (doc._id !== undefined) {
    doc.id = typeof doc._id === "string" ? doc._id : String(doc._id);
  }
  return doc as T;
}

export class MongoDBAdapter extends BaseDatabaseAdapter {
  private client: any;
  private db: any;
  private session: any = null;

  async connect(): Promise<void> {
    if (this.connected) return;

    const mongodb = await dynamicImport("mongodb");
    const MongoClient = mongodb.MongoClient;

    this.client = new MongoClient(this.config.url, {
      ignoreUndefined: true,
    });
    await this.client.connect();

    if (this.config.database) {
      this.db = this.client.db(this.config.database);
    } else {
      const parsed = new URL(this.config.url);
      const dbName = parsed.pathname.replace(/^\//, "") || "opencodehub";
      this.db = this.client.db(dbName);
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client?.close();
    this.connected = false;
    this.session = null;
  }

  private collection(table: string) {
    return this.db.collection(table);
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const filter = toMongoFilter(options?.where);
    const doc = await this.collection(table).findOne(filter, this.session ? { session: this.session } : undefined);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const filter = toMongoFilter(options?.where);
    let cursor = this.collection(table).find(filter, this.session ? { session: this.session } : undefined);

    if (options?.orderBy?.length) {
      const sort: Record<string, 1 | -1> = {};
      for (const o of options.orderBy) {
        sort[o.field === "id" ? "_id" : o.field] = o.direction === "asc" ? 1 : -1;
      }
      cursor = cursor.sort(sort);
    }
    if (options?.offset) cursor = cursor.skip(options.offset);
    if (options?.limit) cursor = cursor.limit(options.limit);

    const docs = await cursor.toArray();
    return docs.map((d: any) => normalizeDoc<T>(d));
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const doc: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    if (doc.id !== undefined) {
      doc._id = String(doc.id);
      delete doc.id;
    }

    await this.collection(table).insertOne(doc, this.session ? { session: this.session } : undefined);
    return normalizeDoc<T>(doc);
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (!data.length) return [];
    const docs = data.map((item) => {
      const doc: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      if (doc.id !== undefined) {
        doc._id = String(doc.id);
        delete doc.id;
      }
      return doc;
    });
    await this.collection(table).insertMany(docs, this.session ? { session: this.session } : undefined);
    return docs.map((d) => normalizeDoc<T>(d));
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const patch = { ...(data as Record<string, unknown>) };
    delete patch.id;
    await this.collection(table).updateOne(
      { _id: String(id) },
      { $set: patch },
      this.session ? { session: this.session } : undefined
    );
    const updated = await this.collection(table).findOne({ _id: String(id) }, this.session ? { session: this.session } : undefined);
    return updated ? normalizeDoc<T>(updated) : null;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const patch = { ...(data as Record<string, unknown>) };
    delete patch.id;
    const result = await this.collection(table).updateMany(
      toMongoFilter(options.where),
      { $set: patch },
      this.session ? { session: this.session } : undefined
    );
    return result.modifiedCount || 0;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const result = await this.collection(table).deleteOne({ _id: String(id) }, this.session ? { session: this.session } : undefined);
    return (result.deletedCount || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const result = await this.collection(table).deleteMany(
      toMongoFilter(options?.where),
      this.session ? { session: this.session } : undefined
    );
    return result.deletedCount || 0;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    return this.collection(table).countDocuments(toMongoFilter(options?.where), this.session ? { session: this.session } : undefined);
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    throw new Error("MongoDB rawQuery is not supported via SQL string");
  }

  async beginTransaction(): Promise<void> {
    if (this.session) return;
    this.session = this.client.startSession();
    this.session.startTransaction();
  }

  async commitTransaction(): Promise<void> {
    if (!this.session) return;
    await this.session.commitTransaction();
    await this.session.endSession();
    this.session = null;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.session) return;
    await this.session.abortTransaction();
    await this.session.endSession();
    this.session = null;
  }

  async tableExists(table: string): Promise<boolean> {
    const cols = await this.db.listCollections({ name: table }).toArray();
    return cols.length > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const exists = await this.tableExists(table);
    if (!exists) await this.db.createCollection(table);
  }

  async dropTable(table: string): Promise<void> {
    const exists = await this.tableExists(table);
    if (exists) await this.collection(table).drop();
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    // No-op by default for document model; schema evolves dynamically.
  }

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
    const migrations = this.collection("_migrations");
    await migrations.updateOne(
      { _id: migration.id },
      { $set: { name: migration.name, executedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const exists = await this.tableExists("_migrations");
    if (!exists) return [];
    const rows = await this.collection("_migrations").find({}).toArray();
    return rows.map((row: any) => ({
      id: String(row._id),
      name: row.name || String(row._id),
      executedAt: row.executedAt ? new Date(row.executedAt) : null,
      status: row.executedAt ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    return type;
  }
}
