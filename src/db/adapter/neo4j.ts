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

function toWhereCypher(where?: WhereClause[]): { clause: string; params: Record<string, any> } {
  if (!where?.length) return { clause: "", params: {} };
  const params: Record<string, any> = {};
  const parts: string[] = [];
  where.forEach((w, i) => {
    const key = `p${i}`;
    params[key] = w.value;
    const field = `n.${w.field}`;
    switch (w.operator) {
      case "=":
      case "eq":
        parts.push(`${field} = $${key}`);
        break;
      case "!=":
      case "ne":
        parts.push(`${field} <> $${key}`);
        break;
      case ">":
      case "gt":
        parts.push(`${field} > $${key}`);
        break;
      case ">=":
      case "gte":
        parts.push(`${field} >= $${key}`);
        break;
      case "<":
      case "lt":
        parts.push(`${field} < $${key}`);
        break;
      case "<=":
      case "lte":
        parts.push(`${field} <= $${key}`);
        break;
      default:
        break;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export class Neo4jAdapter extends BaseDatabaseAdapter {
  private driver: any;

  async connect(): Promise<void> {
    if (this.connected) return;
    const neo4j = await dynamicImport("neo4j-driver");
    this.driver = neo4j.driver(
      this.config.url,
      neo4j.auth.basic(this.config.user || "neo4j", this.config.password || "")
    );
    await this.driver.verifyConnectivity();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.driver?.close();
    this.connected = false;
  }

  private async run(query: string, params?: Record<string, any>) {
    const session = this.driver.session();
    try {
      return await session.run(query, params || {});
    } finally {
      await session.close();
    }
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const rows = await this.findMany<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const where = toWhereCypher(options?.where);
    const limit = options?.limit ? `LIMIT ${options.limit}` : "";
    const result = await this.run(
      `MATCH (n:${table}) ${where.clause} RETURN n ${limit}`,
      where.params
    );
    return result.records.map((r: any) => r.get("n").properties) as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const props = { ...(data as any) };
    if (!props.id) props.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.run(`CREATE (n:${table} $props)`, { props });
    return props as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of data) out.push(await this.create<T>(table, item));
    return out;
  }

  async update<T>(table: string, id: string | number, data: Partial<T>): Promise<T | null> {
    const props = { ...(data as any) };
    const result = await this.run(
      `MATCH (n:${table} {id: $id}) SET n += $props RETURN n`,
      { id: String(id), props }
    );
    if (!result.records.length) return null;
    return result.records[0].get("n").properties as T;
  }

  async updateMany<T>(table: string, options: QueryOptions, data: Partial<T>): Promise<number> {
    const where = toWhereCypher(options?.where);
    const result = await this.run(
      `MATCH (n:${table}) ${where.clause} SET n += $props RETURN count(n) as c`,
      { ...where.params, props: data }
    );
    return Number(result.records[0]?.get("c") || 0);
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const result = await this.run(
      `MATCH (n:${table} {id: $id}) DETACH DELETE n RETURN count(n) as c`,
      { id: String(id) }
    );
    return Number(result.records[0]?.get("c") || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    const where = toWhereCypher(options?.where);
    const result = await this.run(
      `MATCH (n:${table}) ${where.clause} WITH n, count(n) as c DETACH DELETE n RETURN c`,
      where.params
    );
    return Number(result.records[0]?.get("c") || 0);
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    const where = toWhereCypher(options?.where);
    const result = await this.run(`MATCH (n:${table}) ${where.clause} RETURN count(n) as c`, where.params);
    return Number(result.records[0]?.get("c") || 0);
  }

  async rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.run(query, (params as any) || {});
    return {
      rows: result.records.map((r: any) => r.toObject()) as T[],
      rowCount: result.records.length,
    };
  }

  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}

  async tableExists(table: string): Promise<boolean> {
    const result = await this.run("CALL db.labels() YIELD label RETURN collect(label) as labels");
    const labels = result.records[0]?.get("labels") || [];
    return labels.includes(table);
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {}
  async dropTable(table: string): Promise<void> {
    await this.run(`MATCH (n:${table}) DETACH DELETE n`);
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
