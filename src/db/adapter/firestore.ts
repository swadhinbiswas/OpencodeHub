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

function applyQuery(ref: any, where?: WhereClause[]) {
  let query = ref;
  for (const clause of where || []) {
    const opMap: Record<string, string> = {
      "=": "==",
      eq: "==",
      "!=": "!=",
      ne: "!=",
      ">": ">",
      gt: ">",
      ">=": ">=",
      gte: ">=",
      "<": "<",
      lt: "<",
      "<=": "<=",
      lte: "<=",
      in: "in",
      "not in": "not-in",
    };
    const op = opMap[clause.operator];
    if (!op) continue;
    query = query.where(clause.field, op, clause.value);
  }
  return query;
}

export class FirestoreAdapter extends BaseDatabaseAdapter {
  private db: any;

  async connect(): Promise<void> {
    if (this.connected) return;
    const mod = await dynamicImport("@google-cloud/firestore");
    const Firestore = mod.Firestore;
    this.db = new Firestore({
      projectId: this.config.database || process.env.GOOGLE_CLOUD_PROJECT,
      keyFilename: this.config.options?.keyFilename as string | undefined,
    });
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
    let query = applyQuery(this.db.collection(table), options?.where);
    if (options?.orderBy?.length) {
      for (const o of options.orderBy) query = query.orderBy(o.field, o.direction);
    }
    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset) query = query.offset(options.offset);
    const snap = await query.get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const id = (data as any).id as string | undefined;
    const docData = { ...(data as any) };
    delete docData.id;
    if (id) {
      await this.db.collection(table).doc(id).set(docData);
      return { id, ...docData } as T;
    }
    const ref = await this.db.collection(table).add(docData);
    return { id: ref.id, ...docData } as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const ref = this.db.collection(table).doc(String(id));
    const doc = await ref.get();
    if (!doc.exists) return null;
    await ref.set(data as any, { merge: true });
    const next = await ref.get();
    return { id: next.id, ...next.data() } as T;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      await this.db.collection(table).doc(String(row.id)).set(data as any, { merge: true });
    }
    return rows.length;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const ref = this.db.collection(table).doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    for (const row of rows) {
      await this.db.collection(table).doc(String(row.id)).delete();
    }
    return rows.length;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    const rows = await this.findMany<any>(table, options);
    return rows.length;
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    throw new Error("Firestore adapter does not support SQL rawQuery");
  }

  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}

  async tableExists(table: string): Promise<boolean> {
    const snap = await this.db.collection(table).limit(1).get();
    return !snap.empty;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {}
  async dropTable(table: string): Promise<void> {
    const rows = await this.findMany<any>(table);
    for (const row of rows) {
      await this.db.collection(table).doc(String(row.id)).delete();
    }
  }
  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {}

  async runMigration(migration: Migration): Promise<void> {
    await migration.up(this);
    await this.db.collection("_migrations").doc(migration.id).set({
      id: migration.id,
      name: migration.name,
      executedAt: new Date().toISOString(),
    });
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const snap = await this.db.collection("_migrations").get();
    return snap.docs.map((d: any) => ({
      id: d.id,
      name: d.data().name || d.id,
      executedAt: d.data().executedAt ? new Date(d.data().executedAt) : null,
      status: d.data().executedAt ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    return type;
  }
}
