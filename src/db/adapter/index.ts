/**
 * Database Adapter Factory
 * Creates the appropriate adapter based on configuration
 */

// import { MongoDBAdapter } from "./mongodb";
// import { PostgresAdapter } from "./postgres";
// import { RedisAdapter } from "./redis";
import { SQLiteAdapter } from "./sqlite";
import { DatabaseAdapter, DatabaseConfig, DatabaseDriver } from "./types";

// Lazy-loaded adapters for optional dependencies
const adapterLoaders: Record<
  DatabaseDriver,
  () => Promise<new (config: DatabaseConfig) => DatabaseAdapter>
> = {
  sqlite: async () => SQLiteAdapter,
  postgres: async () => {
    const { PostgresAdapter } = await import("./postgres");
    return PostgresAdapter;
  },
  mysql: async () => {
    throw new Error("MySQL adapter not implemented");
  },
  mongodb: async () => { throw new Error("MongoDB adapter not implemented"); },
  turso: async () => {
    throw new Error("Turso adapter not implemented");
  },
  planetscale: async () => {
    throw new Error("Planetscale adapter not implemented");
  },
  redis: async () => { throw new Error("Redis adapter not implemented"); },
  firestore: async () => {
    throw new Error("Firestore adapter not implemented");
  },
  dynamodb: async () => {
    throw new Error("DynamoDB adapter not implemented");
  },
  neo4j: async () => {
    throw new Error("Neo4j adapter not implemented");
  },
  cockroachdb: async () => { throw new Error("CockroachDB adapter not implemented"); },
  cassandra: async () => {
    throw new Error("Cassandra adapter not implemented");
  },
  scylladb: async () => {
    throw new Error("ScyllaDB adapter not implemented");
  },
  surrealdb: async () => {
    throw new Error("SurrealDB adapter not implemented");
  },
  tidb: async () => {
    throw new Error("TiDB adapter not implemented");
  },
  mariadb: async () => {
    throw new Error("MariaDB adapter not implemented");
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

  private constructor() { }

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
