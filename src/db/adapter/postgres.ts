/**
 * PostgreSQL Database Adapter
 * Supports PostgreSQL via node-postgres (pg)
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
    private inTransaction: boolean = false;
    private transactionClient: any = null;

    constructor(config: DatabaseConfig) {
        super(config);
    }

    async connect(): Promise<void> {
        if (this.connected) return;

        try {
            // Dynamic import for pg
            const { Pool } = await import("pg");

            this.pool = new Pool({
                connectionString: this.config.url,
                ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            // Test connection
            const client = await this.pool.connect();
            client.release();
            this.connected = true;
        } catch (error) {
            throw new Error(`Failed to connect to PostgreSQL database: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (!this.connected) return;
        await this.pool?.end();
        this.connected = false;
    }

    private getClient() {
        return this.transactionClient || this.pool;
    }

    async findOne<T>(table: string, options?: QueryOptions): Promise<T | null> {
        const results = await this.findMany<T>(table, { ...options, limit: 1 });
        return results[0] || null;
    }

    async findMany<T>(table: string, options?: QueryOptions): Promise<T[]> {
        const selectClause = options?.select?.length
            ? options.select.join(", ")
            : "*";

        if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error("Invalid table name");

        let sql = `SELECT ${selectClause} FROM "${table}"`;
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options?.where?.length) {
            const whereResult = this.buildWhereConditions(options.where, paramIndex);
            sql += ` ${whereResult.sql}`;
            params.push(...whereResult.params);
            paramIndex += whereResult.params.length;
        }

        if (options?.orderBy?.length) {
            const orderClauses = options.orderBy.map(
                (o) => `"${o.field}" ${o.direction.toUpperCase()}`
            );
            sql += ` ORDER BY ${orderClauses.join(", ")}`;
        }

        if (options?.limit) {
            sql += ` LIMIT $${paramIndex}`;
            params.push(options.limit);
            paramIndex++;
        }

        if (options?.offset) {
            sql += ` OFFSET $${paramIndex}`;
            params.push(options.offset);
            paramIndex++;
        }

        const result = await this.getClient().query(sql, params);
        return result.rows as T[];
    }

    async create<T>(table: string, data: Partial<T>): Promise<T> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const columns = keys.map((k) => `"${k}"`).join(", ");

        const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`;
        const result = await this.getClient().query(sql, values);
        return result.rows[0] as T;
    }

    async createMany<T>(table: string, data: Partial<T>[]): Promise<T[]> {
        if (data.length === 0) return [];

        const results: T[] = [];
        for (const item of data) {
            const created = await this.create<T>(table, item);
            results.push(created);
        }
        return results;
    }

    async update<T>(
        table: string,
        id: string | number,
        data: Partial<T>
    ): Promise<T | null> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");

        const sql = `UPDATE "${table}" SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
        const result = await this.getClient().query(sql, [...values, id]);

        if (result.rowCount === 0) return null;
        return result.rows[0] as T;
    }

    async updateMany<T>(
        table: string,
        options: QueryOptions,
        data: Partial<T>
    ): Promise<number> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");

        let sql = `UPDATE "${table}" SET ${setClause}`;
        const params: unknown[] = [...values];
        let paramIndex = keys.length + 1;

        if (options?.where?.length) {
            const whereResult = this.buildWhereConditions(options.where, paramIndex);
            sql += ` ${whereResult.sql}`;
            params.push(...whereResult.params);
        }

        const result = await this.getClient().query(sql, params);
        return result.rowCount || 0;
    }

    async delete(table: string, id: string | number): Promise<boolean> {
        const sql = `DELETE FROM "${table}" WHERE id = $1`;
        const result = await this.getClient().query(sql, [id]);
        return (result.rowCount || 0) > 0;
    }

    async deleteMany(table: string, options?: QueryOptions): Promise<number> {
        let sql = `DELETE FROM "${table}"`;
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options?.where?.length) {
            const whereResult = this.buildWhereConditions(options.where, paramIndex);
            sql += ` ${whereResult.sql}`;
            params.push(...whereResult.params);
        }

        const result = await this.getClient().query(sql, params);
        return result.rowCount || 0;
    }

    async count(table: string, options?: QueryOptions): Promise<number> {
        let sql = `SELECT COUNT(*) as count FROM "${table}"`;
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options?.where?.length) {
            const whereResult = this.buildWhereConditions(options.where, paramIndex);
            sql += ` ${whereResult.sql}`;
            params.push(...whereResult.params);
        }

        const result = await this.getClient().query(sql, params);
        return parseInt(result.rows[0].count, 10);
    }

    async rawQuery<T>(
        query: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        // Convert SQLite-style ? placeholders to PostgreSQL $n
        let pgQuery = query;
        let paramIndex = 1;
        pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);

        const result = await this.getClient().query(pgQuery, params || []);
        return {
            rows: result.rows as T[],
            rowCount: result.rowCount || 0,
            affectedRows: result.rowCount || 0,
        };
    }

    async beginTransaction(): Promise<void> {
        if (this.inTransaction) return;
        this.transactionClient = await this.pool.connect();
        await this.transactionClient.query("BEGIN");
        this.inTransaction = true;
    }

    async commitTransaction(): Promise<void> {
        if (!this.inTransaction) return;
        await this.transactionClient.query("COMMIT");
        this.transactionClient.release();
        this.transactionClient = null;
        this.inTransaction = false;
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.inTransaction) return;
        await this.transactionClient.query("ROLLBACK");
        this.transactionClient.release();
        this.transactionClient = null;
        this.inTransaction = false;
    }

    async tableExists(table: string): Promise<boolean> {
        const sql = `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`;
        const result = await this.getClient().query(sql, [table]);
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
                def += ` DEFAULT ${this.formatDefaultValue(col.defaultValue)}`;
            }

            return def;
        });

        // Add primary key constraint
        if (schema.primaryKey) {
            const pkFields = Array.isArray(schema.primaryKey)
                ? schema.primaryKey.map(k => `"${k}"`).join(", ")
                : `"${schema.primaryKey}"`;
            columnDefs.push(`PRIMARY KEY (${pkFields})`);
        }

        // Add foreign key constraints
        if (schema.foreignKeys) {
            for (const fk of schema.foreignKeys) {
                const fkCols = fk.columns.map(c => `"${c}"`).join(", ");
                const refCols = fk.references.columns.map(c => `"${c}"`).join(", ");
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
        await this.getClient().query(sql);

        // Create indexes
        if (schema.indexes) {
            for (const idx of schema.indexes) {
                const uniqueStr = idx.unique ? "UNIQUE " : "";
                const idxCols = idx.columns.map(c => `"${c}"`).join(", ");
                const idxSql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${idx.name}" ON "${table}" (${idxCols})`;
                await this.getClient().query(idxSql);
            }
        }
    }

    async dropTable(table: string): Promise<void> {
        await this.getClient().query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    async alterTable(table: string, changes: TableAlterCommand[]): Promise<void> {
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
                                change.column.defaultValue
                            )}`;
                        }
                        await this.getClient().query(`ALTER TABLE "${table}" ADD COLUMN ${def}`);
                    }
                    break;
                case "drop_column":
                    if (change.columnName) {
                        await this.getClient().query(
                            `ALTER TABLE "${table}" DROP COLUMN "${change.columnName}"`
                        );
                    }
                    break;
                case "add_index":
                    if (change.index) {
                        const uniqueStr = change.index.unique ? "UNIQUE " : "";
                        const idxCols = change.index.columns.map(c => `"${c}"`).join(", ");
                        await this.getClient().query(
                            `CREATE ${uniqueStr}INDEX "${change.index.name}" ON "${table}" (${idxCols})`
                        );
                    }
                    break;
                case "drop_index":
                    if (change.indexName) {
                        await this.getClient().query(`DROP INDEX IF EXISTS "${change.indexName}"`);
                    }
                    break;
            }
        }
    }

    async runMigration(migration: Migration): Promise<void> {
        await this.beginTransaction();
        try {
            await migration.up(this);

            // Record migration
            await this.rawQuery(
                `INSERT INTO "_migrations" (id, name, executed_at) VALUES ($1, $2, $3)`,
                [migration.id, migration.name, new Date().toISOString()]
            );

            await this.commitTransaction();
        } catch (error) {
            await this.rollbackTransaction();
            throw error;
        }
    }

    async getMigrationStatus(): Promise<MigrationStatus[]> {
        // Ensure migrations table exists
        const exists = await this.tableExists("_migrations");
        if (!exists) {
            await this.createTable("_migrations", {
                columns: [
                    { name: "id", type: "string", nullable: false },
                    { name: "name", type: "string", nullable: false },
                    { name: "executed_at", type: "datetime", nullable: true },
                ],
                primaryKey: "id",
            });
        }

        const result = await this.rawQuery<{
            id: string;
            name: string;
            executed_at: string | null;
        }>(`SELECT * FROM "_migrations" ORDER BY executed_at`);

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
            timestamp: "TIMESTAMPTZ",
            json: "JSONB",
            blob: "BYTEA",
            uuid: "UUID",
        };
        return typeMap[type] || "TEXT";
    }

    private formatDefaultValue(value: unknown): string {
        if (value === null) return "NULL";
        if (typeof value === "string") return `'${value}'`;
        if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
        return String(value);
    }

    // Override to support PostgreSQL-style parameterized queries
    protected buildWhereConditions(
        conditions: QueryOptions["where"],
        startIndex: number = 1
    ): { sql: string; params: unknown[] } {
        if (!conditions || conditions.length === 0) {
            return { sql: "", params: [] };
        }

        const clauses: string[] = [];
        const params: unknown[] = [];
        let paramIndex = startIndex;

        for (const condition of conditions) {
            const { field, operator, value } = condition;
            const quotedField = `"${field}"`;

            switch (operator) {
                case "eq":
                    clauses.push(`${quotedField} = $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "ne":
                    clauses.push(`${quotedField} != $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "lt":
                    clauses.push(`${quotedField} < $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "lte":
                    clauses.push(`${quotedField} <= $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "gt":
                    clauses.push(`${quotedField} > $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "gte":
                    clauses.push(`${quotedField} >= $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "like":
                    clauses.push(`${quotedField} ILIKE $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                    break;
                case "in":
                    if (Array.isArray(value)) {
                        const placeholders = value.map(() => `$${paramIndex++}`).join(", ");
                        clauses.push(`${quotedField} IN (${placeholders})`);
                        params.push(...value);
                    }
                    break;
                case "isNull":
                    clauses.push(`${quotedField} IS NULL`);
                    break;
                case "isNotNull":
                    clauses.push(`${quotedField} IS NOT NULL`);
                    break;
            }
        }

        return {
            sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
            params,
        };
    }
}
