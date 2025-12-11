/**
 * MongoDB Database Adapter
 * Supports MongoDB and compatible databases
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

export class MongoDBAdapter extends BaseDatabaseAdapter {
  private client: any;
  private db: any;
  private session: any;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const { MongoClient } = await import("mongodb");
      this.client = new MongoClient(this.config.url);
      await this.client.connect();

      // Extract database name from URL or use default
      const dbName =
        this.config.database ||
        this.config.url.split("/").pop()?.split("?")[0] ||
        "opencodehub";
      this.db = this.client.db(dbName);
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to MongoDB: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client?.close();
    this.connected = false;
  }

  private buildMongoFilter(where?: WhereClause[]): Record<string, any> {
    if (!where || where.length === 0) return {};

    const filter: Record<string, any> = {};

    for (const clause of where) {
      const field = clause.field === "id" ? "_id" : clause.field;

      switch (clause.operator) {
        case "=":
          filter[field] = clause.value;
          break;
        case "!=":
          filter[field] = { $ne: clause.value };
          break;
        case ">":
          filter[field] = { $gt: clause.value };
          break;
        case "<":
          filter[field] = { $lt: clause.value };
          break;
        case ">=":
          filter[field] = { $gte: clause.value };
          break;
        case "<=":
          filter[field] = { $lte: clause.value };
          break;
        case "in":
          filter[field] = { $in: clause.value };
          break;
        case "not in":
          filter[field] = { $nin: clause.value };
          break;
        case "like":
        case "ilike":
          const pattern = (clause.value as string).replace(/%/g, ".*");
          filter[field] = {
            $regex: pattern,
            $options: clause.operator === "ilike" ? "i" : "",
          };
          break;
        case "is null":
          filter[field] = { $eq: null };
          break;
        case "is not null":
          filter[field] = { $ne: null };
          break;
      }
    }

    return filter;
  }

  private transformDocument<T>(doc: any): T {
    if (!doc) return doc;
    const { _id, ...rest } = doc;
    return { id: _id?.toString(), ...rest } as T;
  }

  private prepareDocument(data: any): any {
    const { id, ...rest } = data;
    if (id) {
      const { ObjectId } = require("mongodb");
      return { _id: new ObjectId(id), ...rest };
    }
    return rest;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const collection = this.db.collection(table);
    const filter = this.buildMongoFilter(options?.where);

    const findOptions: any = {};
    if (options?.select) {
      findOptions.projection = options.select.reduce((acc, field) => {
        acc[field === "id" ? "_id" : field] = 1;
        return acc;
      }, {} as Record<string, number>);
    }

    const doc = await collection.findOne(filter, findOptions);
    return doc ? this.transformDocument<T>(doc) : null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const collection = this.db.collection(table);
    const filter = this.buildMongoFilter(options?.where);

    let cursor = collection.find(filter);

    if (options?.select) {
      const projection = options.select.reduce((acc, field) => {
        acc[field === "id" ? "_id" : field] = 1;
        return acc;
      }, {} as Record<string, number>);
      cursor = cursor.project(projection);
    }

    if (options?.orderBy) {
      const sort = options.orderBy.reduce((acc, o) => {
        acc[o.field === "id" ? "_id" : o.field] =
          o.direction === "asc" ? 1 : -1;
        return acc;
      }, {} as Record<string, number>);
      cursor = cursor.sort(sort);
    }

    if (options?.offset) {
      cursor = cursor.skip(options.offset);
    }

    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    const docs = await cursor.toArray();
    return docs.map((doc: any) => this.transformDocument<T>(doc));
  }

  async findById<T>(table: string, id: string | number): Promise<T | null> {
    const { ObjectId } = await import("mongodb");
    const collection = this.db.collection(table);
    const doc = await collection.findOne({ _id: new ObjectId(id.toString()) });
    return doc ? this.transformDocument<T>(doc) : null;
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const collection = this.db.collection(table);
    const doc = this.prepareDocument(data);
    const result = await collection.insertOne(doc);
    return this.transformDocument<T>({ _id: result.insertedId, ...doc });
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const collection = this.db.collection(table);
    const docs = data.map((d) => this.prepareDocument(d));
    const result = await collection.insertMany(docs);

    return docs.map((doc, i) =>
      this.transformDocument<T>({ _id: result.insertedIds[i], ...doc })
    );
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const { ObjectId } = await import("mongodb");
    const collection = this.db.collection(table);
    const { id: _, ...updateData } = data as any;

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id.toString()) },
      { $set: updateData },
      { returnDocument: "after" }
    );

    return result ? this.transformDocument<T>(result) : null;
  }

  async updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number> {
    const collection = this.db.collection(table);
    const filter = this.buildMongoFilter(options?.where);
    const { id: _, ...updateData } = data as any;

    const result = await collection.updateMany(filter, { $set: updateData });
    return result.modifiedCount;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const { ObjectId } = await import("mongodb");
    const collection = this.db.collection(table);
    const result = await collection.deleteOne({
      _id: new ObjectId(id.toString()),
    });
    return result.deletedCount > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const collection = this.db.collection(table);
    const filter = this.buildMongoFilter(options?.where);
    const result = await collection.deleteMany(filter);
    return result.deletedCount;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    const collection = this.db.collection(table);
    const filter = this.buildMongoFilter(options?.where);
    return collection.countDocuments(filter);
  }

  async rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    // MongoDB doesn't use SQL, but we can support aggregation pipeline as JSON string
    try {
      const pipeline = JSON.parse(query);
      const collectionName = (params?.[0] as string) || "default";
      const collection = this.db.collection(collectionName);
      const results = await collection.aggregate(pipeline).toArray();
      return {
        rows: results.map((doc: any) => this.transformDocument<T>(doc)),
        rowCount: results.length,
      };
    } catch {
      throw new Error(
        "MongoDB adapter rawQuery expects aggregation pipeline JSON"
      );
    }
  }

  async beginTransaction(): Promise<void> {
    this.session = this.client.startSession();
    this.session.startTransaction();
  }

  async commitTransaction(): Promise<void> {
    if (this.session) {
      await this.session.commitTransaction();
      this.session.endSession();
      this.session = null;
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (this.session) {
      await this.session.abortTransaction();
      this.session.endSession();
      this.session = null;
    }
  }

  async tableExists(table: string): Promise<boolean> {
    const collections = await this.db
      .listCollections({ name: table })
      .toArray();
    return collections.length > 0;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    // MongoDB creates collections automatically, but we can set up indexes
    const collection = this.db.collection(table);

    // Create indexes
    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const indexSpec = idx.columns.reduce((acc, col) => {
          acc[col] = 1;
          return acc;
        }, {} as Record<string, number>);

        await collection.createIndex(indexSpec, {
          name: idx.name,
          unique: idx.unique || false,
        });
      }
    }

    // Create unique indexes for unique columns
    for (const col of schema.columns) {
      if (col.unique && col.name !== "id") {
        await collection.createIndex({ [col.name]: 1 }, { unique: true });
      }
    }
  }

  async dropTable(table: string): Promise<void> {
    const exists = await this.tableExists(table);
    if (exists) {
      await this.db.collection(table).drop();
    }
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    const collection = this.db.collection(table);

    for (const change of changes) {
      switch (change.type) {
        case "add_index":
          if (change.index) {
            const indexSpec = change.index.columns.reduce((acc, col) => {
              acc[col] = 1;
              return acc;
            }, {} as Record<string, number>);
            await collection.createIndex(indexSpec, {
              name: change.index.name,
              unique: change.index.unique || false,
            });
          }
          break;
        case "drop_index":
          if (change.indexName) {
            await collection.dropIndex(change.indexName);
          }
          break;
        // add_column and drop_column are schema-less operations in MongoDB
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up(this);

      const migrationsCollection = this.db.collection("_migrations");
      await migrationsCollection.insertOne({
        id: migration.id,
        name: migration.name,
        executed_at: new Date(),
      });

      await this.commitTransaction();
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const exists = await this.tableExists("_migrations");
    if (!exists) {
      return [];
    }

    const migrationsCollection = this.db.collection("_migrations");
    const docs = await migrationsCollection
      .find()
      .sort({ executed_at: 1 })
      .toArray();

    return docs.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      executedAt: doc.executed_at,
      status: doc.executed_at ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    // MongoDB is schema-less, but we can return BSON type hints
    const typeMap: Record<ColumnType, string> = {
      string: "string",
      text: "string",
      integer: "int",
      bigint: "long",
      float: "double",
      decimal: "decimal",
      boolean: "bool",
      date: "date",
      datetime: "date",
      timestamp: "date",
      json: "object",
      blob: "binData",
      uuid: "string",
    };
    return typeMap[type] || "string";
  }
}
