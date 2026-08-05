import fs from "fs";
import path from "path";

// Keep config in the DATA_DIR (which defaults to ./data)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      
      // Only set env vars from config.json if they aren't already set in the
      // environment.  CI injects DATABASE_URL etc. via process.env and those
      // must never be overridden by a stale data/config.json on disk.
      if (config.DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = config.DATABASE_URL;
      if (config.DATABASE_DRIVER && !process.env.DATABASE_DRIVER) process.env.DATABASE_DRIVER = config.DATABASE_DRIVER;
      if (config.REDIS_URL && !process.env.REDIS_URL) process.env.REDIS_URL = config.REDIS_URL;
      
      // Store flag in process.env so we don't need to read FS constantly
      process.env.OPENCODEHUB_CONFIGURED = "true";
      
      return true;
    } catch (e) {
      console.error("Failed to parse config.json", e);
    }
  }
  return false;
}

export function saveConfig(config: {
  DATABASE_URL?: string;
  DATABASE_DRIVER?: string;
  REDIS_URL?: string;
}) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Read existing to merge
  let existing = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch(e) {}
  }
  
  const merged = { ...existing, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  
  // Update process.env immediately
  if (merged.DATABASE_URL) process.env.DATABASE_URL = merged.DATABASE_URL;
  if (merged.DATABASE_DRIVER) process.env.DATABASE_DRIVER = merged.DATABASE_DRIVER;
  if (merged.REDIS_URL) process.env.REDIS_URL = merged.REDIS_URL;
  
  process.env.OPENCODEHUB_CONFIGURED = "true";
}

export function isConfigured() {
  if (process.env.OPENCODEHUB_CONFIGURED === "true") return true;
  if (process.env.DATABASE_URL) return true;
  return loadConfig();
}

export function isOfflineMode() {
  return process.env.OFFLINE_MODE === "true" || process.env.OFFLINE_MODE === "1";
}
