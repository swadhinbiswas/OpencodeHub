import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sshKeys } from "@/db/schema";
import {
  badRequest,
  parseBody,
  serverError,
  success,
  unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { generateId, now } from "@/lib/utils";
import type { APIRoute } from "astro";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { withErrorHandler } from "@/lib/errors";
import { logger } from "@/lib/logger";

const addKeySchema = z.object({
  title: z.string().min(1).max(100),
  key: z.string().min(1),
});

function generateFingerprint(key: string): string {
  try {
    const parts = key.trim().split(" ");
    if (parts.length < 2) throw new Error("Invalid key format");

    const base64 = parts[1];
    const buffer = Buffer.from(base64, "base64");
    const hash = crypto.createHash("sha256").update(buffer).digest("base64");
    return `SHA256:${hash.replace(/=+$/, "")}`;
  } catch (e) {
    return "Invalid Key";
  }
}

export const POST: APIRoute = withErrorHandler(async ({ request }) => {
  const tokenPayload = await getUserFromRequest(request);
  if (!tokenPayload) {
    return unauthorized();
  }

  const parsed = await parseBody(request, addKeySchema);
  if ("error" in parsed) return parsed.error;

  const { title, key } = parsed.data;

  // Basic validation of SSH key format
  if (
    !key.startsWith("ssh-rsa") &&
    !key.startsWith("ssh-ed25519") &&
    !key.startsWith("ecdsa-sha2-nistp256")
  ) {
    return badRequest(
      "Invalid SSH key format. Must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-nistp256"
    );
  }

  const fingerprint = generateFingerprint(key);
  if (fingerprint === "Invalid Key") {
    return badRequest("Invalid SSH key content");
  }

  const db = getDatabase() as NodePgDatabase<typeof schema>;

  // Check if key already exists
  const existing = await db.query.sshKeys.findFirst({
    where: eq(sshKeys.fingerprint, fingerprint),
  });

  if (existing) {
    return badRequest("SSH key already exists");
  }

  const keyType = key.split(" ")[0];

  const newKey = {
    id: generateId("ssh"),
    userId: tokenPayload.userId,
    title,
    publicKey: key,
    keyType,
    fingerprint,
    createdAt: new Date(),
  };

  await db.insert(sshKeys).values(newKey);

  logger.info({ userId: tokenPayload.userId, fingerprint }, "SSH key added");

  return success(newKey);
});
