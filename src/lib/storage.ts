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
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// Types
export interface StorageConfig {
  type: "local" | "s3" | "gcs" | "azure" | "rclone" | "gdrive" | "onedrive";
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
  // Google Drive
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  googleFolderId?: string;
  // OneDrive
  onedriveTenantId?: string;
  onedriveClientId?: string;
  onedriveClientSecret?: string;
  onedriveRefreshToken?: string;
  onedriveFolderId?: string;
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
    data: Buffer | Readable | ReadableStream,
    options?: PutOptions
  ): Promise<void>;

  async writeStream(
    key: string,
    stream: Readable | ReadableStream,
    options?: PutOptions
  ): Promise<void> {
    return this.put(key, stream, options);
  }

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
    data: Buffer | Readable | ReadableStream,
    options?: PutOptions
  ): Promise<void> {
    const fullPath = this.getFullPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(fullPath, data);
    } else {
      const writeStream = createWriteStream(fullPath);
      // @ts-ignore
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
    await fs.unlink(fullPath).catch(() => { });
    await fs.unlink(`${fullPath}.meta`).catch(() => { });
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
      } catch { }
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
    } catch { }

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
      })
    );
  }

  async writeStream(
    key: string,
    stream: Readable | ReadableStream,
    options?: PutOptions
  ): Promise<void> {
    const { Upload } = await import("@aws-sdk/lib-storage");
    const client = await this.getClient();

    const upload = new Upload({
      client,
      params: {
        Bucket: this.config.bucket,
        Key: path.join(this.config.basePath, key),
        Body: stream,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl,
        ContentDisposition: options?.contentDisposition,
      },
      queueSize: 4, // Concurrent upload parts
      partSize: 5 * 1024 * 1024, // 5MB chunks
    });

    await upload.done();
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

    // CopySource must be key, potentially URL encoded
    const sourceFullPath = path.join(this.config.basePath, sourceKey);
    const copySource = `${this.config.bucket}/${encodeURIComponent(sourceFullPath)}`;

    await client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        CopySource: copySource,
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
 * Rclone-based storage adapter
 * Supports any rclone-compatible remote (gdrive, dropbox, onedrive, s3, etc.)
 */
export class RcloneStorageAdapter extends StorageAdapter {
  private remote: string;

  constructor(config: StorageConfig) {
    super(config);
    this.remote = config.rcloneRemote || 'remote';
  }

  private getRemotePath(key: string): string {
    return `${this.remote}:${path.join(this.config.basePath, key)}`;
  }

  private async execRclone(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const proc = spawn('rclone', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`rclone failed: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`rclone not found: ${err.message}`));
      });
    });
  }

  async put(key: string, data: Buffer | Readable, options?: PutOptions): Promise<void> {
    // For rclone, we need to write to a temp file first, then rclone copy
    const tempDir = path.join(process.cwd(), 'data', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);

    try {
      if (Buffer.isBuffer(data)) {
        await fs.writeFile(tempFile, data);
      } else {
        const writeStream = createWriteStream(tempFile);
        // @ts-ignore
        await pipeline(Readable.from(data as any), writeStream);
      }

      // Use rclone copyto for single file
      await this.execRclone(['copyto', tempFile, this.getRemotePath(key)]);
    } finally {
      await fs.unlink(tempFile).catch(() => { });
    }
  }

  async writeStream(
    key: string,
    stream: Readable | ReadableStream,
    options?: PutOptions
  ): Promise<void> {
    return this.put(key, stream, options); // defined above to handle streams via temp file
  }

  async get(key: string, options?: GetOptions): Promise<Buffer> {
    const tempDir = path.join(process.cwd(), 'data', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `download-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);

    try {
      await this.execRclone(['copyto', this.getRemotePath(key), tempFile]);

      if (options?.range) {
        const fd = await fs.open(tempFile, 'r');
        const buffer = Buffer.alloc(options.range.end - options.range.start + 1);
        await fd.read(buffer, 0, buffer.length, options.range.start);
        await fd.close();
        return buffer;
      }

      return fs.readFile(tempFile);
    } finally {
      await fs.unlink(tempFile).catch(() => { });
    }
  }

  async getStream(key: string, options?: GetOptions): Promise<Readable> {
    // For streaming, download to temp then stream
    const buffer = await this.get(key, options);
    return Readable.from(buffer);
  }

  async delete(key: string): Promise<void> {
    await this.execRclone(['deletefile', this.getRemotePath(key)]).catch(() => { });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.execRclone(['lsf', this.getRemotePath(key)]);
      return true;
    } catch {
      return false;
    }
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const remotePath = `${this.remote}:${path.join(this.config.basePath, options?.prefix || '')}`;

    try {
      const { stdout } = await this.execRclone([
        'lsjson',
        remotePath,
        options?.delimiter === '/' ? '' : '-R',
        '--no-modtime=false',
      ].filter(Boolean));

      const items = JSON.parse(stdout || '[]');
      const objects: StorageObject[] = [];
      const prefixes = new Set<string>();

      for (const item of items) {
        if (item.IsDir) {
          if (options?.delimiter === '/') {
            prefixes.add(item.Path + '/');
          }
        } else {
          objects.push({
            key: item.Path,
            size: item.Size || 0,
            lastModified: new Date(item.ModTime || Date.now()),
            etag: item.ID || undefined,
          });
        }
      }

      return {
        objects: objects.slice(0, options?.maxKeys || 1000),
        prefixes: options?.delimiter ? Array.from(prefixes) : undefined,
        isTruncated: objects.length > (options?.maxKeys || 1000),
      };
    } catch {
      return { objects: [], isTruncated: false };
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.execRclone(['copyto', this.getRemotePath(sourceKey), this.getRemotePath(destKey)]);
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    await this.execRclone(['moveto', this.getRemotePath(sourceKey), this.getRemotePath(destKey)]);
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    // Rclone link command for supported remotes
    try {
      const { stdout } = await this.execRclone(['link', this.getRemotePath(key)]);
      return stdout.trim();
    } catch {
      // Fall back to local proxy URL
      return `/api/storage/download/${encodeURIComponent(key)}`;
    }
  }

  async getSignedUploadUrl(key: string, expiresIn?: number): Promise<string> {
    // Rclone doesn't support signed upload URLs, use proxy
    return `/api/storage/upload/${encodeURIComponent(key)}`;
  }

  async stat(key: string): Promise<StorageObject> {
    const { stdout } = await this.execRclone(['lsjson', this.getRemotePath(key)]);
    const items = JSON.parse(stdout || '[]');

    if (items.length === 0) {
      throw new Error('File not found');
    }

    const item = items[0];
    return {
      key,
      size: item.Size || 0,
      lastModified: new Date(item.ModTime || Date.now()),
      etag: item.ID,
      contentType: item.MimeType,
    };
  }
}

/**
 * Google Drive storage adapter
 */
export class GoogleDriveStorageAdapter extends StorageAdapter {
  private drive: any;
  private folderId: string;

  constructor(config: StorageConfig) {
    super(config);
    this.folderId = config.googleFolderId || 'root';
  }

  private async getDrive() {
    if (this.drive) return this.drive;

    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      this.config.googleClientId,
      this.config.googleClientSecret
    );
    oauth2Client.setCredentials({
      refresh_token: this.config.googleRefreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: oauth2Client });
    return this.drive;
  }

  private async findFileByPath(filePath: string): Promise<string | null> {
    const drive = await this.getDrive();
    const parts = filePath.split('/').filter(Boolean);
    let parentId = this.folderId;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const mimeType = isLast ? undefined : 'application/vnd.google-apps.folder';

      const q = `name='${name}' and '${parentId}' in parents and trashed=false${mimeType ? ` and mimeType='${mimeType}'` : ''}`;
      const res = await drive.files.list({ q, fields: 'files(id,name)' });

      if (res.data.files?.length === 0) return null;
      parentId = res.data.files[0].id;
    }

    return parentId;
  }

  private async ensureFolderPath(folderPath: string): Promise<string> {
    const drive = await this.getDrive();
    const parts = folderPath.split('/').filter(Boolean);
    let parentId = this.folderId;

    for (const name of parts) {
      if (name === ".") continue; // Skip current directory dot

      const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const res = await drive.files.list({ q, fields: 'files(id)' });

      if (res.data.files?.length > 0) {
        parentId = res.data.files[0].id;
        // console.log(`[GoogleDrive] Found existing folder '${name}', id=${parentId}`);
      } else {
        console.log(`[GoogleDrive] Creating folder '${name}' in parent '${parentId}'`);
        const folder = await drive.files.create({
          requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
          },
          fields: 'id',
        });
        parentId = folder.data.id;
        console.log(`[GoogleDrive] Created folder '${name}', id=${parentId}`);
      }
    }

    return parentId;
  }

  async put(key: string, data: Buffer | Readable, options?: PutOptions): Promise<void> {
    const drive = await this.getDrive();
    // For Google Drive, use key directly as path relative to the configured folder
    // basePath is for local storage, not needed for cloud folder structure
    const fullPath = key;
    const fileName = path.basename(fullPath);
    const folderPath = path.dirname(fullPath);

    const parentId = await this.ensureFolderPath(folderPath);
    const existingId = await this.findFileByPath(fullPath);

    const media = {
      mimeType: options?.contentType || 'application/octet-stream',
      body: Buffer.isBuffer(data) ? Readable.from(data) : data,
    };

    if (existingId) {
      await drive.files.update({ fileId: existingId, media });
    } else {
      await drive.files.create({
        requestBody: { name: fileName, parents: [parentId] },
        media,
        fields: 'id',
      });
    }
  }

  async get(key: string, options?: GetOptions): Promise<Buffer> {
    const drive = await this.getDrive();
    const fullPath = key; // Use key directly, not basePath prefix
    const fileId = await this.findFileByPath(fullPath);

    if (!fileId) throw new Error(`File not found: ${key}`);

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(res.data);
    if (options?.range) {
      return buffer.slice(options.range.start, options.range.end + 1);
    }
    return buffer;
  }

  async getStream(key: string, options?: GetOptions): Promise<Readable> {
    const buffer = await this.get(key, options);
    return Readable.from(buffer);
  }

  async delete(key: string): Promise<void> {
    const drive = await this.getDrive();
    const fullPath = key;
    const fileId = await this.findFileByPath(fullPath);
    if (fileId) await drive.files.delete({ fileId });
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = key;
    return (await this.findFileByPath(fullPath)) !== null;
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const drive = await this.getDrive();
    // Do not use basePath for Google Drive, use prefix directly
    const prefix = options?.prefix || '';

    // If prefix is provided, we MUST find that specific folder.
    // If it doesn't exist, return empty list (or throw).
    // Only use root folderId if prefix is empty.
    let folderId: string | null = null;

    if (prefix) {
      folderId = await this.findFileByPath(prefix);
      if (!folderId) {
        // Folder not found, return empty list
        return { objects: [], prefixes: [], isTruncated: false };
      }
    } else {
      folderId = this.folderId;
    }

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,size,modifiedTime,mimeType)',
      pageSize: options?.maxKeys || 1000,
    });

    const objects: StorageObject[] = [];
    const prefixes: string[] = [];

    for (const file of res.data.files || []) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        prefixes.push(file.name + '/');
      } else {
        const key = options?.prefix ? path.join(options.prefix, file.name) : file.name;
        objects.push({
          key,
          size: parseInt(file.size || '0'),
          lastModified: new Date(file.modifiedTime),
        });
      }
    }

    return { objects, prefixes, isTruncated: false };
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const drive = await this.getDrive();
    const sourcePath = path.join(this.config.basePath, sourceKey);
    const destPath = path.join(this.config.basePath, destKey);
    const sourceId = await this.findFileByPath(sourcePath);
    if (!sourceId) throw new Error('Source file not found');

    const parentId = await this.ensureFolderPath(path.dirname(destPath));
    await drive.files.copy({
      fileId: sourceId,
      requestBody: { name: path.basename(destPath), parents: [parentId] },
    });
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    await this.copy(sourceKey, destKey);
    await this.delete(sourceKey);
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const fullPath = path.join(this.config.basePath, key);
    const fileId = await this.findFileByPath(fullPath);
    if (!fileId) throw new Error('File not found');
    return `https://drive.google.com/uc?id=${fileId}&export=download`;
  }

  async getSignedUploadUrl(key: string, expiresIn?: number): Promise<string> {
    return `/api/storage/upload/${encodeURIComponent(key)}`;
  }

  async stat(key: string): Promise<StorageObject> {
    const drive = await this.getDrive();
    const fullPath = path.join(this.config.basePath, key);
    const fileId = await this.findFileByPath(fullPath);
    if (!fileId) throw new Error('File not found');

    const res = await drive.files.get({
      fileId,
      fields: 'id,name,size,modifiedTime,mimeType',
    });

    return {
      key,
      size: parseInt(res.data.size || '0'),
      lastModified: new Date(res.data.modifiedTime),
      contentType: res.data.mimeType,
    };
  }
}

/**
 * OneDrive storage adapter
 */
export class OneDriveStorageAdapter extends StorageAdapter {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: StorageConfig) {
    super(config);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      client_id: this.config.onedriveClientId!,
      client_secret: this.config.onedriveClientSecret!,
      refresh_token: this.config.onedriveRefreshToken!,
      grant_type: 'refresh_token',
    });

    const tenantId = this.config.onedriveTenantId || 'common';
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: 'POST', body: params }
    );

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
    return this.accessToken!;
  }

  private async graphRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const baseUrl = this.config.onedriveFolderId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${this.config.onedriveFolderId}`
      : 'https://graph.microsoft.com/v1.0/me/drive/root';

    return fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  async put(key: string, data: Buffer | Readable, options?: PutOptions): Promise<void> {
    const fullPath = path.join(this.config.basePath, key);
    const buffer = Buffer.isBuffer(data) ? data : await this.streamToBuffer(data);

    // Use simple upload for files < 4MB, session upload for larger
    if (buffer.length < 4 * 1024 * 1024) {
      await this.graphRequest(`:/${encodeURIComponent(fullPath)}:/content`, {
        method: 'PUT',
        headers: { 'Content-Type': options?.contentType || 'application/octet-stream' },
        body: buffer as any,
      });
    } else {
      // Create upload session for large files
      const sessionRes = await this.graphRequest(
        `:/${encodeURIComponent(fullPath)}:/createUploadSession`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
      const session = await sessionRes.json();

      // Upload in 10MB chunks
      const chunkSize = 10 * 1024 * 1024;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, Math.min(i + chunkSize, buffer.length));
        await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${i}-${i + chunk.length - 1}/${buffer.length}`,
          },
          body: chunk as any,
        });
      }
    }
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async get(key: string, options?: GetOptions): Promise<Buffer> {
    const fullPath = path.join(this.config.basePath, key);
    const res = await this.graphRequest(`:/${encodeURIComponent(fullPath)}:/content`, {
      headers: options?.range
        ? { Range: `bytes=${options.range.start}-${options.range.end}` }
        : {},
    });

    if (!res.ok) throw new Error(`File not found: ${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async getStream(key: string, options?: GetOptions): Promise<Readable> {
    const buffer = await this.get(key, options);
    return Readable.from(buffer);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.config.basePath, key);
    await this.graphRequest(`:/${encodeURIComponent(fullPath)}`, { method: 'DELETE' });
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = path.join(this.config.basePath, key);
    const res = await this.graphRequest(`:/${encodeURIComponent(fullPath)}`);
    return res.ok;
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const prefix = path.join(this.config.basePath, options?.prefix || '');
    const res = await this.graphRequest(`:/${encodeURIComponent(prefix)}:/children`);

    if (!res.ok) return { objects: [], isTruncated: false };

    const data = await res.json();
    const objects: StorageObject[] = [];
    const prefixes: string[] = [];

    for (const item of data.value || []) {
      if (item.folder) {
        prefixes.push(item.name + '/');
      } else {
        objects.push({
          key: item.name,
          size: item.size || 0,
          lastModified: new Date(item.lastModifiedDateTime),
        });
      }
    }

    return { objects, prefixes, isTruncated: !!data['@odata.nextLink'] };
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = path.join(this.config.basePath, sourceKey);
    const destPath = path.join(this.config.basePath, destKey);
    const destFolder = path.dirname(destPath);
    const destName = path.basename(destPath);

    // Get destination folder ID
    const folderRes = await this.graphRequest(`:/${encodeURIComponent(destFolder)}`);
    const folder = await folderRes.json();

    await this.graphRequest(`:/${encodeURIComponent(sourcePath)}:/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentReference: { id: folder.id },
        name: destName,
      }),
    });
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = path.join(this.config.basePath, sourceKey);
    const destPath = path.join(this.config.basePath, destKey);
    const destFolder = path.dirname(destPath);
    const destName = path.basename(destPath);

    const folderRes = await this.graphRequest(`:/${encodeURIComponent(destFolder)}`);
    const folder = await folderRes.json();

    await this.graphRequest(`:/${encodeURIComponent(sourcePath)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentReference: { id: folder.id },
        name: destName,
      }),
    });
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const fullPath = path.join(this.config.basePath, key);
    const res = await this.graphRequest(
      `:/${encodeURIComponent(fullPath)}:/createLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
      }
    );
    const data = await res.json();
    return data.link?.webUrl || `/api/storage/download/${encodeURIComponent(key)}`;
  }

  async getSignedUploadUrl(key: string, expiresIn?: number): Promise<string> {
    return `/api/storage/upload/${encodeURIComponent(key)}`;
  }

  async stat(key: string): Promise<StorageObject> {
    const fullPath = path.join(this.config.basePath, key);
    const res = await this.graphRequest(`:/${encodeURIComponent(fullPath)}`);
    if (!res.ok) throw new Error('File not found');

    const data = await res.json();
    return {
      key,
      size: data.size || 0,
      lastModified: new Date(data.lastModifiedDateTime),
      contentType: data.file?.mimeType,
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
      return new RcloneStorageAdapter(config);
    case "gdrive":
      return new GoogleDriveStorageAdapter(config);
    case "onedrive":
      return new OneDriveStorageAdapter(config);
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

// Singleton instance
let storageInstance: StorageAdapter | null = null;
let lastConfigHash: string = "";

export async function getStorage(): Promise<StorageAdapter> {
  // Check DB for config override
  try {
    const { getDatabase, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // We use a light check or cache here ideally. For now, let's fetch.
    // Optimization: In a real app, cache this for X seconds.
    const configRow = await db.query.systemConfig.findFirst({
      where: eq(schema.systemConfig.key, "storage_config")
    });

    if (configRow) {
      // If config changed, re-init
      if (configRow.value !== lastConfigHash) {
        const config = JSON.parse(configRow.value) as StorageConfig;
        storageInstance = createStorageAdapter(config);
        lastConfigHash = configRow.value;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch storage config from DB, using env fallback", e);
  }

  if (!storageInstance) {
    const storageType = (import.meta.env?.STORAGE_TYPE || process.env.STORAGE_TYPE || "local") as StorageConfig["type"];

    // BasePath should be empty for cloud storage (S3, GCS, etc)
    // Only use directory path for local storage
    let basePath = "";
    if (storageType === "local") {
      basePath = import.meta.env?.STORAGE_PATH || process.env.STORAGE_PATH || "./data/storage";
    }

    const config: StorageConfig = {
      type: storageType,
      basePath,
      bucket: import.meta.env?.STORAGE_BUCKET || process.env.STORAGE_BUCKET,
      region: import.meta.env?.STORAGE_REGION || process.env.STORAGE_REGION,
      endpoint: import.meta.env?.STORAGE_ENDPOINT || process.env.STORAGE_ENDPOINT,
      accessKeyId: import.meta.env?.STORAGE_ACCESS_KEY_ID || process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env?.STORAGE_SECRET_ACCESS_KEY || process.env.STORAGE_SECRET_ACCESS_KEY,
      rcloneRemote: import.meta.env?.STORAGE_RCLONE_REMOTE || process.env.STORAGE_RCLONE_REMOTE,
      // Google Drive
      googleClientId: import.meta.env?.OAUTH_GOOGLE_CLIENT_ID || process.env.OAUTH_GOOGLE_CLIENT_ID || import.meta.env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: import.meta.env?.OAUTH_GOOGLE_CLIENT_SECRET || process.env.OAUTH_GOOGLE_CLIENT_SECRET || import.meta.env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      googleRefreshToken: import.meta.env?.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
      googleFolderId: import.meta.env?.GOOGLE_FOLDER_ID || process.env.GOOGLE_FOLDER_ID,
    };
    storageInstance = createStorageAdapter(config);
    lastConfigHash = JSON.stringify(config);
  }
  return storageInstance;
}

export async function updateStorageConfig(config: StorageConfig, userId?: string): Promise<void> {
  const { getDatabase, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Validate config (basic)
  if (!config.type) throw new Error("Storage type required");

  // Save to DB
  const value = JSON.stringify(config);

  await db.insert(schema.systemConfig)
    .values({
      key: "storage_config",
      value,
      updatedById: userId
    })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: {
        value,
        updatedAt: new Date(),
        updatedById: userId
      }
    });

  // Force reload next time
  lastConfigHash = "";
  storageInstance = null;
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
  const storage = await getStorage();
  const stream = createReadStream(filePath);
  await storage.put(key, stream, options);
}

// Download a file
export async function downloadFile(
  key: string,
  destPath: string
): Promise<void> {
  const storage = await getStorage();
  const data = await storage.get(key);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, data);
}

// Get file as base64
export async function getFileAsBase64(key: string): Promise<string> {
  const storage = await getStorage();
  const data = await storage.get(key);
  return data.toString("base64");
}

// Calculate file hash
export async function getFileHash(
  key: string,
  algorithm: string = "sha256"
): Promise<string> {
  const storage = await getStorage();
  const data = await storage.get(key);
  return crypto.createHash(algorithm).update(data).digest("hex");
}

export async function getSignedUploadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const storage = await getStorage();
  return storage.getSignedUploadUrl(key, expiresIn);
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const storage = await getStorage();
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
