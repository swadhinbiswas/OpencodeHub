/**
 * Database Adapter Factory
 * Creates the appropriate adapter based on configuration
 */

import { MongoDBAdapter } from "./mongodb";
import { PostgresAdapter } from "./postgres";
import { RedisAdapter } from "./redis";
import { SQLiteAdapter } from "./sqlite";
import { DatabaseAdapter, DatabaseConfig, DatabaseDriver } from "./types";

// Lazy-loaded adapters for optional dependencies
const adapterLoaders: Record<
  DatabaseDriver,
  () => Promise<new (config: DatabaseConfig) => DatabaseAdapter>
> = {
  sqlite: async () => SQLiteAdapter,
  postgres: async () => PostgresAdapter,
  mysql: async () => {
    const { MySQLAdapter } = await import("./mysql");
    return MySQLAdapter;
  },
  mongodb: async () => MongoDBAdapter,
  turso: async () => {
    const { TursoAdapter } = await import("./turso");
    return TursoAdapter;
  },
  planetscale: async () => {
    const { PlanetscaleAdapter } = await import("./planetscale");
    return PlanetscaleAdapter;
  },
  redis: async () => RedisAdapter,
  firestore: async () => {
    const { FirestoreAdapter } = await import("./firestore");
    return FirestoreAdapter;
  },
  dynamodb: async () => {
    const { DynamoDBAdapter } = await import("./dynamodb");
    return DynamoDBAdapter;
  },
  neo4j: async () => {
    const { Neo4jAdapter } = await import("./neo4j");
    return Neo4jAdapter;
  },
  cockroachdb: async () => PostgresAdapter, // CockroachDB is PostgreSQL-compatible
  cassandra: async () => {
    const { CassandraAdapter } = await import("./cassandra");
    return CassandraAdapter;
  },
  scylladb: async () => {
    const { CassandraAdapter } = await import("./cassandra");
    return CassandraAdapter; // ScyllaDB uses same driver as Cassandra
  },
  surrealdb: async () => {
    const { SurrealDBAdapter } = await import("./surrealdb");
    return SurrealDBAdapter;
  },
  tidb: async () => {
    const { MySQLAdapter } = await import("./mysql");
    return MySQLAdapter; // TiDB is MySQL-compatible
  },
  mariadb: async () => {
    const { MySQLAdapter } = await import("./mysql");
    return MySQLAdapter; // MariaDB is MySQL-compatible
  },
  custom: async () => {
    throw new Error("Custom adapter must be provided explicitly");
  },
};

export async function createAdapter(
  config: DatabaseConfig
): Promise<DatabaseAdapter> {
  const loader = adapterLoaders[config.driver];

  if (!loader) {
    throw new Error(`Unsupported database driver: ${config.driver}`);
  }

  const AdapterClass = await loader();
  return new AdapterClass(config);
}

export function parseConnectionString(url: string): Partial<DatabaseConfig> {
  try {
    // Handle SQLite paths
    if (url.startsWith("./") || url.startsWith("/") || url.endsWith(".db")) {
      return { driver: "sqlite", url };
    }

    // Handle file:// URLs (SQLite)
    if (url.startsWith("file:")) {
      return { driver: "sqlite", url: url.replace("file:", "") };
    }

    // Handle libsql:// URLs (Turso)
    if (url.startsWith("libsql:")) {
      return { driver: "turso", url };
    }

    // Parse standard URLs
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.replace(":", "");

    const driverMap: Record<string, DatabaseDriver> = {
      postgres: "postgres",
      postgresql: "postgres",
      mysql: "mysql",
      mariadb: "mariadb",
      mongodb: "mongodb",
      "mongodb+srv": "mongodb",
      redis: "redis",
      rediss: "redis",
      bolt: "neo4j",
      neo4j: "neo4j",
      "neo4j+s": "neo4j",
      cassandra: "cassandra",
      scylla: "scylladb",
      surrealdb: "surrealdb",
      ws: "surrealdb",
      wss: "surrealdb",
    };

    const driver = driverMap[protocol];
    if (!driver) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }

    return {
      driver,
      url,
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || undefined,
      user: urlObj.username || undefined,
      password: urlObj.password || undefined,
      database: urlObj.pathname.slice(1) || undefined,
      ssl: protocol.endsWith("s") || urlObj.searchParams.get("ssl") === "true",
    };
  } catch (error) {
    throw new Error(`Failed to parse connection string: ${error}`);
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private adapter: DatabaseAdapter | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(config: DatabaseConfig): Promise<void> {
    if (this.adapter?.isConnected()) {
      await this.adapter.disconnect();
    }

    this.config = config;
    this.adapter = await createAdapter(config);
    await this.adapter.connect();
  }

  async initializeFromEnv(): Promise<void> {
    const driver = (process.env.DATABASE_DRIVER || "sqlite") as DatabaseDriver;
    const url = process.env.DATABASE_URL || "./data/opencodehub.db";

    const config: DatabaseConfig = {
      driver,
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      ssl: process.env.DATABASE_SSL === "true",
    };

    await this.initialize(config);
  }

  getAdapter(): DatabaseAdapter {
    if (!this.adapter) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.adapter;
  }

  getConfig(): DatabaseConfig | null {
    return this.config;
  }

  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();

// Convenience function to get adapter
export function getDb(): DatabaseAdapter {
  return db.getAdapter();
}
