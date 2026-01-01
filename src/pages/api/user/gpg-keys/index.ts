
import { spawn } from "child_process";
import { getDatabase } from "@/db";
import { gpgKeys } from "@/db/schema";
import {
    badRequest,
    parseBody,
    serverError,
    success,
    unauthorized,
} from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { generateId, now } from "@/lib/utils";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import * as openpgp from "openpgp";
import { z } from "zod";

const addKeySchema = z.object({
    name: z.string().min(1).max(100),
    key: z.string().min(1),
});

export const POST: APIRoute = async ({ request }) => {
    try {
        const tokenPayload = await getUserFromRequest(request);
        if (!tokenPayload) {
            return unauthorized();
        }

        const parsed = await parseBody(request, addKeySchema);
        if ("error" in parsed) {
            logger.debug({ error: parsed.error }, "GPG parse body error");
            return parsed.error;
        }

        const { name, key } = parsed.data;

        let keyId: string;
        try {
            const readKey = await openpgp.readKey({ armoredKey: key });
            keyId = readKey.getKeyID().toHex();

            // Also ensure it's a public key
            if (readKey.isPrivate()) {
                logger.debug("GPG key is private");
                return badRequest("Please provide a public key, not a private key.");
            }
        } catch (e) {
            logger.debug({ err: e }, "GPG readKey failed");
            return badRequest("Invalid GPG key. Please ensure it is a valid armored public key block.");
        }

        // Import to GPG keyring
        try {
            const child = spawn("gpg", ["--import"], { stdio: ["pipe", "ignore", "ignore"] });
            child.stdin.write(key);
            child.stdin.end();
            // We don't await compilation, just fire and forget or wait for close?
            // Better to wait to ensure it's imported.
            await new Promise((resolve) => child.on("close", resolve));
        } catch (e) {
            logger.error({ err: e }, "Failed to import GPG key to system keyring");
        }

        const db = getDatabase();

        // Check if key already exists
        const existing = await db.query.gpgKeys.findFirst({
            where: eq(gpgKeys.keyId, keyId),
        });

        if (existing) {
            logger.debug({ keyId }, "GPG key already exists");
            return badRequest("GPG key already exists");
        }

        const newKey = {
            id: generateId("gpg"),
            userId: tokenPayload.userId,
            name,
            keyId,
            publicKey: key,
            createdAt: now(),
        };

        await db.insert(gpgKeys).values(newKey);

        return success(newKey);
    } catch (error) {
        logger.error({ err: error }, "Add GPG key error");
        return serverError("Failed to add GPG key");
    }
};
