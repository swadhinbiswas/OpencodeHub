/**
 * PostgreSQL Database Adapter
 * Supports PostgreSQL, CockroachDB, TiDB, and compatible databases
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
} from "./types";

export class PostgresAdapter extends BaseDatabaseAdapter {
  private pool: any;
  private client: any;
  private inTransaction: boolean = false;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const { Pool } = await import("pg");
      this.pool = new Pool({
        connectionString: this.config.url,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.poolSize || 10,
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      this.connected = true;
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.pool?.end();
    this.connected = false;
  }

  private async getClient() {
    if (this.client) return this.client;
    return this.pool;
  }

  async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...options, limit: 1 });
    return results[0] || null;
  }

  async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
    const selectClause = options?.select?.length
      ? options.select.map((s) => `"${s}"`).join(", ")
      : "*";

    let sql = `SELECT ${selectClause} FROM "${table}"`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options?.where?.length) {
      const conditions: string[] = [];
      for (const clause of options.where) {
        switch (clause.operator) {
          case "is null":
            conditions.push(`"${clause.field}" IS NULL`);
            break;
          case "is not null":
            conditions.push(`"${clause.field}" IS NOT NULL`);
            break;
          case "in":
          case "not in":
            const values = clause.value as unknown[];
            const placeholders = values
              .map(() => `$${paramIndex++}`)
              .join(", ");
            conditions.push(
              `"${
                clause.field
              }" ${clause.operator.toUpperCase()} (${placeholders})`
            );
            params.push(...values);
            break;
          case "ilike":
            conditions.push(`"${clause.field}" ILIKE $${paramIndex++}`);
            params.push(clause.value);
            break;
          default:
            conditions.push(
              `"${clause.field}" ${clause.operator} $${paramIndex++}`
            );
            params.push(clause.value);
        }
      }
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    if (options?.orderBy?.length) {
      const orderClauses = options.orderBy.map(
        (o) => `"${o.field}" ${o.direction.toUpperCase()}`
      );
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    if (options?.limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const client = await this.getClient();
    const result = await client.query(sql, params);
    return result.rows as T[];
  }

  async create<T>(table: string, data: Partial<T>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const columns = keys.map((k) => `"${k}"`).join(", ");

    const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
    const client = await this.getClient();
    const result = await client.query(sql, values);
    return result.rows[0] as T;
  }

  async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const keys = Object.keys(data[0]);
    const columns = keys.map((k) => `"${k}"`).join(", ");

    const allValues: unknown[] = [];
    const valueGroups: string[] = [];
    let paramIndex = 1;

    for (const item of data) {
      const placeholders = keys.map(() => `$${paramIndex++}`).join(", ");
      valueGroups.push(`(${placeholders})`);
      allValues.push(...keys.map((k) => (item as any)[k]));
    }

    const sql = `INSERT INTO "${table}" (${columns}) VALUES ${valueGroups.join(
      ", "
    )} RETURNING *`;
    const client = await this.getClient();
    const result = await client.query(sql, allValues);
    return result.rows as T[];
  }

  async update<T>(
    table: string,
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");

    const sql = `UPDATE "${table}" SET ${setClause} WHERE "id" = $${
      keys.length + 1
    } RETURNING *`;
    const client = await this.getClient();
    const result = await client.query(sql, [...values, id]);
    return result.rows[0] || null;
  }

  async updateMany<T>(
    table: string,
    options: QueryOptions,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    let paramIndex = 1;

    const setClause = keys.map((k) => `"${k}" = $${paramIndex++}`).join(", ");
    let sql = `UPDATE "${table}" SET ${setClause}`;
    const params: unknown[] = [...values];

    if (options?.where?.length) {
      const conditions: string[] = [];
      for (const clause of options.where) {
        conditions.push(
          `"${clause.field}" ${clause.operator} $${paramIndex++}`
        );
        params.push(clause.value);
      }
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const client = await this.getClient();
    const result = await client.query(sql, params);
    return result.rowCount || 0;
  }

  async delete(table: string, id: string | number): Promise<boolean> {
    const sql = `DELETE FROM "${table}" WHERE "id" = $1`;
    const client = await this.getClient();
    const result = await client.query(sql, [id]);
    return (result.rowCount || 0) > 0;
  }

  async deleteMany(table: string, options?: QueryOptions): Promise<number> {
    let sql = `DELETE FROM "${table}"`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options?.where?.length) {
      const conditions: string[] = [];
      for (const clause of options.where) {
        conditions.push(
          `"${clause.field}" ${clause.operator} $${paramIndex++}`
        );
        params.push(clause.value);
      }
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const client = await this.getClient();
    const result = await client.query(sql, params);
    return result.rowCount || 0;
  }

  async count(table: string, options?: QueryOptions): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM "${table}"`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options?.where?.length) {
      const conditions: string[] = [];
      for (const clause of options.where) {
        conditions.push(
          `"${clause.field}" ${clause.operator} $${paramIndex++}`
        );
        params.push(clause.value);
      }
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const client = await this.getClient();
    const result = await client.query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  async rawQuery<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const client = await this.getClient();
    const result = await client.query(query, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
      affectedRows: result.rowCount || 0,
    };
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.client = await this.pool.connect();
    await this.client.query("BEGIN");
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.client.query("COMMIT");
    this.client.release();
    this.client = null;
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    await this.client.query("ROLLBACK");
    this.client.release();
    this.client = null;
    this.inTransaction = false;
  }

  async tableExists(table: string): Promise<boolean> {
    const sql = `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )`;
    const client = await this.getClient();
    const result = await client.query(sql, [table]);
    return result.rows[0].exists;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const columnDefs = schema.columns.map((col) => {
      let def = `"${col.name}" ${this.mapColumnType(col.type)}`;

      if (col.autoIncrement) {
        def = `"${col.name}" SERIAL`;
      }

      if (!col.nullable && !col.autoIncrement) def += " NOT NULL";
      if (col.unique) def += " UNIQUE";
      if (col.defaultValue !== undefined && !col.autoIncrement) {
        def += ` DEFAULT ${this.formatDefaultValue(
          col.defaultValue,
          col.type
        )}`;
      }

      return def;
    });

    // Add primary key constraint
    if (schema.primaryKey) {
      const pkFields = Array.isArray(schema.primaryKey)
        ? schema.primaryKey.map((f) => `"${f}"`).join(", ")
        : `"${schema.primaryKey}"`;
      columnDefs.push(`PRIMARY KEY (${pkFields})`);
    }

    // Add foreign key constraints
    if (schema.foreignKeys) {
      for (const fk of schema.foreignKeys) {
        const fkCols = fk.columns.map((c) => `"${c}"`).join(", ");
        const refCols = fk.references.columns.map((c) => `"${c}"`).join(", ");
        let constraint = `FOREIGN KEY (${fkCols}) REFERENCES "${fk.references.table}"(${refCols})`;
        if (fk.onDelete)
          constraint += ` ON DELETE ${fk.onDelete.toUpperCase()}`;
        if (fk.onUpdate)
          constraint += ` ON UPDATE ${fk.onUpdate.toUpperCase()}`;
        columnDefs.push(constraint);
      }
    }

    const sql = `CREATE TABLE IF NOT EXISTS "${table}" (\n  ${columnDefs.join(
      ",\n  "
    )}\n)`;
    const client = await this.getClient();
    await client.query(sql);

    // Create indexes
    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? "UNIQUE " : "";
        const cols = idx.columns.map((c) => `"${c}"`).join(", ");
        const idxSql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${idx.name}" ON "${table}" (${cols})`;
        await client.query(idxSql);
      }
    }
  }

  async dropTable(table: string): Promise<void> {
    const client = await this.getClient();
    await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }

  async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
    const client = await this.getClient();

    for (const change of changes) {
      switch (change.type) {
        case "add_column":
          if (change.column) {
            let def = `"${change.column.name}" ${this.mapColumnType(
              change.column.type
            )}`;
            if (!change.column.nullable) def += " NOT NULL";
            if (change.column.defaultValue !== undefined) {
              def += ` DEFAULT ${this.formatDefaultValue(
                change.column.defaultValue,
                change.column.type
              )}`;
            }
            await client.query(`ALTER TABLE "${table}" ADD COLUMN ${def}`);
          }
          break;
        case "drop_column":
          if (change.columnName) {
            await client.query(
              `ALTER TABLE "${table}" DROP COLUMN "${change.columnName}"`
            );
          }
          break;
        case "add_index":
          if (change.index) {
            const uniqueStr = change.index.unique ? "UNIQUE " : "";
            const cols = change.index.columns.map((c) => `"${c}"`).join(", ");
            await client.query(
              `CREATE ${uniqueStr}INDEX "${change.index.name}" ON "${table}" (${cols})`
            );
          }
          break;
        case "drop_index":
          if (change.indexName) {
            await client.query(`DROP INDEX IF EXISTS "${change.indexName}"`);
          }
          break;
      }
    }
  }

  async runMigration(migration: Migration): Promise<void> {
    await this.beginTransaction();
    try {
      await migration.up(this);

      await this.rawQuery(
        `INSERT INTO "_migrations" ("id", "name", "executed_at") VALUES ($1, $2, $3)`,
        [migration.id, migration.name, new Date().toISOString()]
      );

      await this.commitTransaction();
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  async getMigrationStatus(): Promise<MigrationStatus[]> {
    const exists = await this.tableExists("_migrations");
    if (!exists) {
      await this.createTable("_migrations", {
        columns: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "executed_at", type: "timestamp", nullable: true },
        ],
        primaryKey: "id",
      });
    }

    const result = await this.rawQuery<{
      id: string;
      name: string;
      executed_at: string | null;
    }>('SELECT * FROM "_migrations" ORDER BY "executed_at"');

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      executedAt: row.executed_at ? new Date(row.executed_at) : null,
      status: row.executed_at ? "executed" : "pending",
    }));
  }

  protected mapColumnType(type: ColumnType): string {
    const typeMap: Record<ColumnType, string> = {
      string: "VARCHAR(255)",
      text: "TEXT",
      integer: "INTEGER",
      bigint: "BIGINT",
      float: "REAL",
      decimal: "DECIMAL",
      boolean: "BOOLEAN",
      date: "DATE",
      datetime: "TIMESTAMP",
      timestamp: "TIMESTAMP",
      json: "JSONB",
      blob: "BYTEA",
      uuid: "UUID",
    };
    return typeMap[type] || "TEXT";
  }

  private formatDefaultValue(value: unknown, type: ColumnType): string {
    if (value === null) return "NULL";
    if (type === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "string") return `'${value}'`;
    if (type === "json") return `'${JSON.stringify(value)}'::jsonb`;
    return String(value);
  }
}
