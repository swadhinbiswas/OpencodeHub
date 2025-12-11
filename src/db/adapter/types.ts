/**
 * Universal Database Adapter Layer (UDA-Layer)
 * Provides a unified interface for any database system
 */

export type DatabaseDriver =
  | "sqlite"
  | "postgres"
  | "mysql"
  | "mongodb"
  | "turso"
  | "planetscale"
  | "redis"
  | "firestore"
  | "dynamodb"
  | "neo4j"
  | "cockroachdb"
  | "cassandra"
  | "scylladb"
  | "surrealdb"
  | "tidb"
  | "mariadb"
  | "custom";

export interface DatabaseConfig {
  driver: DatabaseDriver;
  url: string;
  authToken?: string;
  user?: string;
  password?: string;
  database?: string;
  host?: string;
  port?: number;
  ssl?: boolean;
  poolSize?: number;
  options?: Record<string, unknown>;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  lastInsertId?: string | number;
  affectedRows?: number;
}

export interface WhereClause {
  field: string;
  operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "in"
    | "not in"
    | "like"
    | "ilike"
    | "is null"
    | "is not null";
  value: unknown;
}

export interface OrderByClause {
  field: string;
  direction: "asc" | "desc";
}

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
  select?: string[];
  include?: string[];
}

export interface DatabaseAdapter {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // CRUD operations
  findOne<T>(table: string, options?: QueryOptions): Promise<T | null>;
  findMany<T>(table: string, options?: QueryOptions): Promise<T[]>;
  findById<T>(table: string, id: string | number): Promise<T | null>;

  create<T>(table: string, data: Partial<T>): Promise<T>;
  createMany<T>(table: string, data: Partial<T>[]): Promise<T[]>;

  update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null>;
  updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number>;

  delete(table: string, id: string | number): Promise<boolean>;
  deleteMany(table: string, options?: QueryOptions): Promise<number>;

  // Advanced queries
  count(table: string, options?: QueryOptions): Promise<number>;
  exists(table: string, options?: QueryOptions): Promise<boolean>;

  // Raw queries (for complex operations)
  rawQuery<T>(query: string, params?: unknown[]): Promise<QueryResult<T>>;

  // Transaction support
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  // Schema management
  tableExists(table: string): Promise<boolean>;
  createTable(table: string, schema: TableSchema): Promise<void>;
  dropTable(table: string): Promise<void>;
  alterTable(table: string, changes: TableAlterCommand[]): Promise<void>;

  // Migrations
  runMigration(migration: Migration): Promise<void>;
  getMigrationStatus(): Promise<MigrationStatus[]>;
}

export interface TableSchema {
  columns: ColumnDefinition[];
  primaryKey?: string | string[];
  indexes?: IndexDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  defaultValue?: unknown;
  unique?: boolean;
  autoIncrement?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "json"
  | "blob"
  | "uuid";

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface ForeignKeyDefinition {
  columns: string[];
  references: {
    table: string;
    columns: string[];
  };
  onDelete?: "cascade" | "set null" | "restrict" | "no action";
  onUpdate?: "cascade" | "set null" | "restrict" | "no action";
}

export interface TableAlterCommand {
  type:
    | "add_column"
    | "drop_column"
    | "modify_column"
    | "add_index"
    | "drop_index";
  column?: ColumnDefinition;
  columnName?: string;
  index?: IndexDefinition;
  indexName?: string;
}

export interface Migration {
  id: string;
  name: string;
  timestamp: number;
  up: (adapter: DatabaseAdapter) => Promise<void>;
  down: (adapter: DatabaseAdapter) => Promise<void>;
}

export interface MigrationStatus {
  id: string;
  name: string;
  executedAt: Date | null;
  status: "pending" | "executed" | "failed";
}

// Abstract base class with common functionality
export abstract class BaseDatabaseAdapter implements DatabaseAdapter {
  protected config: DatabaseConfig;
  protected connected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  abstract findOne<T>(table: string, options?: QueryOptions): Promise<T | null>;
  abstract findMany<T>(table: string, options?: QueryOptions): Promise<T[]>;

  async findById<T>(table: string, id: string | number): Promise<T | null> {
    return this.findOne<T>(table, {
      where: [{ field: "id", operator: "=", value: id }],
    });
  }

  abstract create<T>(table: string, data: Partial<T>): Promise<T>;
  abstract createMany<T>(table: string, data: Partial<T>[]): Promise<T[]>;
  abstract update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null>;
  abstract updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number>;
  abstract delete(table: string, id: string | number): Promise<boolean>;
  abstract deleteMany(table: string, options?: QueryOptions): Promise<number>;

  abstract count(table: string, options?: QueryOptions): Promise<number>;

  async exists(table: string, options?: QueryOptions): Promise<boolean> {
    const count = await this.count(table, options);
    return count > 0;
  }

  abstract rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;

  abstract beginTransaction(): Promise<void>;
  abstract commitTransaction(): Promise<void>;
  abstract rollbackTransaction(): Promise<void>;

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await fn();
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  abstract tableExists(table: string): Promise<boolean>;
  abstract createTable(table: string, schema: TableSchema): Promise<void>;
  abstract dropTable(table: string): Promise<void>;
  abstract alterTable(
    table: string,
    changes: TableAlterCommand[]
  ): Promise<void>;

  abstract runMigration(migration: Migration): Promise<void>;
  abstract getMigrationStatus(): Promise<MigrationStatus[]>;

  // Helper method to build where clause conditions
  protected buildWhereConditions(where: WhereClause[]): {
    sql: string;
    params: unknown[];
  } {
    if (!where || where.length === 0) {
      return { sql: "", params: [] };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const clause of where) {
      switch (clause.operator) {
        case "is null":
          conditions.push(`${clause.field} IS NULL`);
          break;
        case "is not null":
          conditions.push(`${clause.field} IS NOT NULL`);
          break;
        case "in":
        case "not in":
          const values = clause.value as unknown[];
          const placeholders = values.map(() => "?").join(", ");
          conditions.push(
            `${clause.field} ${clause.operator.toUpperCase()} (${placeholders})`
          );
          params.push(...values);
          break;
        default:
          conditions.push(`${clause.field} ${clause.operator} ?`);
          params.push(clause.value);
      }
    }

    return {
      sql: `WHERE ${conditions.join(" AND ")}`,
      params,
    };
  }

  // Helper to map abstract column types to database-specific types
  protected abstract mapColumnType(type: ColumnType): string;
}
