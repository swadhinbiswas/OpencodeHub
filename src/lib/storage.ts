/**
 * OpenCodeHub Storage System
 *
 * Flexible storage adapter supporting:
 * - Local filesystem
 * - S3/MinIO
 * - Google Cloud Storage
 * - Azure Blob Storage
 * - rclone-compatible remotes
 */

import crypto from "crypto";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// Types
export interface StorageConfig {
  type: "local" | "s3" | "gcs" | "azure" | "rclone";
  basePath: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  projectId?: string;
  containerName?: string;
  accountName?: string;
  accountKey?: string;
  rcloneRemote?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListResult {
  objects: StorageObject[];
  prefixes?: string[];
  isTruncated: boolean;
  continuationToken?: string;
}

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
}

export interface GetOptions {
  range?: { start: number; end: number };
}

/**
 * Abstract storage adapter
 */
export abstract class StorageAdapter {
  protected config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  abstract put(
    key: string,
    data: Buffer | Readable,
    options?: PutOptions
  ): Promise<void>;
  abstract get(key: string, options?: GetOptions): Promise<Buffer>;
  abstract getStream(key: string, options?: GetOptions): Promise<Readable>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract list(options?: ListOptions): Promise<ListResult>;
  abstract copy(sourceKey: string, destKey: string): Promise<void>;
  abstract move(sourceKey: string, destKey: string): Promise<void>;
  abstract getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  abstract getSignedUploadUrl(key: string, expiresIn?: number): Promise<string>;
  abstract stat(key: string): Promise<StorageObject>;
}

/**
 * Local filesystem storage adapter
 */
export class LocalStorageAdapter extends StorageAdapter {
  private getFullPath(key: string): string {
    return path.join(this.config.basePath, key);
  }

  async put(
    key: string,
    data: Buffer | Readable,
    options?: PutOptions
  ): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(fullPath, data);
    } else {
      const writeStream = createWriteStream(fullPath);
      await pipeline(data, writeStream);
    }

    // Store metadata in .meta file
    if (options?.metadata) {
      const metaPath = `${fullPath}.meta`;
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          contentType: options.contentType,
          metadata: options.metadata,
          cacheControl: options.cacheControl,
        })
      );
    }
  }

  async get(key: string, options?: GetOptions): Promise<Buffer> {
    const fullPath = this.getFullPath(key);

    if (options?.range) {
      const fd = await fs.open(fullPath, "r");
      const buffer = Buffer.alloc(options.range.end - options.range.start + 1);
      await fd.read(buffer, 0, buffer.length, options.range.start);
      await fd.close();
      return buffer;
    }

    return fs.readFile(fullPath);
  }

  async getStream(key: string, options?: GetOptions): Promise<Readable> {
    const fullPath = this.getFullPath(key);
    return createReadStream(
      fullPath,
      options?.range
        ? {
            start: options.range.start,
            end: options.range.end,
          }
        : undefined
    );
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.unlink(fullPath).catch(() => {});
    await fs.unlink(`${fullPath}.meta`).catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.getFullPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const basePath = path.join(this.config.basePath, options?.prefix || "");
    const objects: StorageObject[] = [];
    const prefixes = new Set<string>();

    const walk = async (dir: string, currentPrefix: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const key = path.join(currentPrefix, entry.name);

          if (entry.isDirectory()) {
            if (options?.delimiter === "/") {
              prefixes.add(key + "/");
            } else {
              await walk(fullPath, key);
            }
          } else if (!entry.name.endsWith(".meta")) {
            const stats = await fs.stat(fullPath);
            objects.push({
              key,
              size: stats.size,
              lastModified: stats.mtime,
              etag: crypto.createHash("md5").update(key).digest("hex"),
            });
          }
        }
      } catch {}
    };

    await walk(basePath, options?.prefix || "");

    return {
      objects: objects.slice(0, options?.maxKeys || 1000),
      prefixes: options?.delimiter ? Array.from(prefixes) : undefined,
      isTruncated: objects.length > (options?.maxKeys || 1000),
    };
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = this.getFullPath(sourceKey);
    const destPath = this.getFullPath(destKey);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = this.getFullPath(sourceKey);
    const destPath = this.getFullPath(destKey);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(sourcePath, destPath);
  }

  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    // For local storage, return a file:// URL
    return `file://${this.getFullPath(key)}`;
  }

  async stat(key: string): Promise<StorageObject> {
    const fullPath = this.getFullPath(key);
    const stats = await fs.stat(fullPath);

    let metadata: Record<string, string> | undefined;
    let contentType: string | undefined;

    try {
      const meta = JSON.parse(await fs.readFile(`${fullPath}.meta`, "utf-8"));
      metadata = meta.metadata;
      contentType = meta.contentType;
    } catch {}

    return {
      key,
      size: stats.size,
      lastModified: stats.mtime,
      etag: crypto
        .createHash("md5")
        .update(await fs.readFile(fullPath))
        .digest("hex"),
      contentType,
      metadata,
    };
  }

  async getSignedUploadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    return `/api/storage/upload/${key}`;
  }
}

/**
 * S3-compatible storage adapter (S3, MinIO, R2, etc.)
 */
export class S3StorageAdapter extends StorageAdapter {
  private client: any; // S3Client from @aws-sdk/client-s3

  constructor(config: StorageConfig) {
    super(config);
    // Initialize S3 client lazily
  }

  private async getClient() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        region: this.config.region || "us-east-1",
        endpoint: this.config.endpoint,
        credentials: this.config.accessKeyId
          ? {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey!,
            }
          : undefined,
        forcePathStyle: !!this.config.endpoint, // Required for MinIO
      });
    }
    return this.client;
  }

  async put(
    key: string,
    data: Buffer | Readable,
    options?: PutOptions
  ): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
        Body: data,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl,
        ContentDisposition: options?.contentDisposition,
      })
    );
  }

  async get(key: string, options?: GetOptions): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
        Range: options?.range
          ? `bytes=${options.range.start}-${options.range.end}`
          : undefined,
      })
    );

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getStream(key: string, options?: GetOptions): Promise<Readable> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
        Range: options?.range
          ? `bytes=${options.range.start}-${options.range.end}`
          : undefined,
      })
    );

    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
      })
    );
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: path.join(this.config.basePath, key),
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: path.join(this.config.basePath, options?.prefix || ""),
        Delimiter: options?.delimiter,
        MaxKeys: options?.maxKeys,
        ContinuationToken: options?.continuationToken,
      })
    );

    return {
      objects: (response.Contents || []).map((obj: any) => ({
        key: obj.Key!.replace(this.config.basePath + "/", ""),
        size: obj.Size!,
        lastModified: obj.LastModified!,
        etag: obj.ETag?.replace(/"/g, ""),
      })),
      prefixes: response.CommonPrefixes?.map((p: any) =>
        p.Prefix!.replace(this.config.basePath + "/", "")
      ),
      isTruncated: response.IsTruncated || false,
      continuationToken: response.NextContinuationToken,
    };
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    await client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        CopySource: `${this.config.bucket}/${path.join(
          this.config.basePath,
          sourceKey
        )}`,
        Key: path.join(this.config.basePath, destKey),
      })
    );
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    await this.copy(sourceKey, destKey);
    await this.delete(sourceKey);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: path.join(this.config.basePath, key),
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  async getSignedUploadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: path.join(this.config.basePath, key),
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  async stat(key: string): Promise<StorageObject> {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    const response = await client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
      })
    );

    return {
      key,
      size: response.ContentLength!,
      lastModified: response.LastModified!,
      etag: response.ETag?.replace(/"/g, ""),
      contentType: response.ContentType,
      metadata: response.Metadata,
    };
  }
}

/**
 * Storage factory
 */
export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.type) {
    case "local":
      return new LocalStorageAdapter(config);
    case "s3":
      return new S3StorageAdapter(config);
    case "gcs":
      // Would implement GCS adapter
      throw new Error("GCS storage not yet implemented");
    case "azure":
      // Would implement Azure Blob adapter
      throw new Error("Azure storage not yet implemented");
    case "rclone":
      // Would implement rclone adapter
      throw new Error("rclone storage not yet implemented");
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

// Singleton instance
let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    const config: StorageConfig = {
      type: (process.env.STORAGE_TYPE as StorageConfig["type"]) || "local",
      basePath: process.env.STORAGE_PATH || "./data/storage",
      bucket: process.env.STORAGE_BUCKET,
      region: process.env.STORAGE_REGION,
      endpoint: process.env.STORAGE_ENDPOINT,
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    };
    storageInstance = createStorageAdapter(config);
  }
  return storageInstance;
}

/**
 * Helper functions for common operations
 */

// Upload a file
export async function uploadFile(
  key: string,
  filePath: string,
  options?: PutOptions
): Promise<void> {
  const storage = getStorage();
  const stream = createReadStream(filePath);
  await storage.put(key, stream, options);
}

// Download a file
export async function downloadFile(
  key: string,
  destPath: string
): Promise<void> {
  const storage = getStorage();
  const data = await storage.get(key);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, data);
}

// Get file as base64
export async function getFileAsBase64(key: string): Promise<string> {
  const storage = getStorage();
  const data = await storage.get(key);
  return data.toString("base64");
}

// Calculate file hash
export async function getFileHash(
  key: string,
  algorithm: string = "sha256"
): Promise<string> {
  const storage = getStorage();
  const data = await storage.get(key);
  return crypto.createHash(algorithm).update(data).digest("hex");
}

export async function getSignedUploadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const storage = getStorage();
  return storage.getSignedUploadUrl(key, expiresIn);
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const storage = getStorage();
  return storage.getSignedUrl(key, expiresIn);
}

export default {
  createStorageAdapter,
  getStorage,
  uploadFile,
  downloadFile,
  getFileAsBase64,
  getFileHash,
  getSignedUploadUrl,
  getSignedDownloadUrl,
};
