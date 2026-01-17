import { getStorage } from "@/lib/storage";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

export interface LfsObject {
  oid: string;
  size: number;
}

export interface LfsBatchRequest {
  operation: "upload" | "download";
  transfers?: string[];
  ref?: { name: string };
  objects: LfsObject[];
}

export interface LfsAction {
  href: string;
  header?: Record<string, string>;
  expires_in?: number;
}

export interface LfsObjectResponse {
  oid: string;
  size: number;
  authenticated?: boolean;
  actions?: {
    download?: LfsAction;
    upload?: LfsAction;
    verify?: LfsAction;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface LfsBatchResponse {
  transfer?: "basic";
  objects: LfsObjectResponse[];
}

export function getLfsStoragePath(repoDiskPath: string): string {
  return path.join(repoDiskPath, "lfs", "objects");
}

export function getLfsObjectPath(repoDiskPath: string, oid: string): string {
  // Git LFS typically stores objects in subdirectories based on the OID hash
  // e.g. oid[0:2]/oid[2:4]/oid
  const first = oid.substring(0, 2);
  const second = oid.substring(2, 4);
  return path.join(getLfsStoragePath(repoDiskPath), first, second, oid);
}

export async function ensureLfsStorage(repoDiskPath: string) {
  const lfsPath = getLfsStoragePath(repoDiskPath);
  if (!existsSync(lfsPath)) {
    await fs.mkdir(lfsPath, { recursive: true });
  }
}

export async function processLfsBatch(
  repoDiskPath: string,
  req: LfsBatchRequest,
  baseUrl: string
): Promise<LfsBatchResponse> {
  const storage = await getStorage();
  const response: LfsBatchResponse = {
    transfer: "basic",
    objects: [],
  };

  for (const obj of req.objects) {
    const key = `lfs/${obj.oid}`;
    const exists = await storage.exists(key);

    const objResp: LfsObjectResponse = {
      oid: obj.oid,
      size: obj.size,
      authenticated: true,
    };

    if (req.operation === "download") {
      if (exists) {
        const url = await storage.getSignedUrl(key, 86400);
        objResp.actions = {
          download: {
            href: url,
            expires_in: 86400,
          },
        };
      } else {
        objResp.error = {
          code: 404,
          message: "Object does not exist",
        };
      }
    } else if (req.operation === "upload") {
      const url = await storage.getSignedUploadUrl(key, 86400);
      objResp.actions = {
        upload: {
          href: url,
          expires_in: 86400,
        },
        verify: {
          href: `${baseUrl}/verify`,
          expires_in: 86400,
        },
      };
    }

    response.objects.push(objResp);
  }

  return response;
}
