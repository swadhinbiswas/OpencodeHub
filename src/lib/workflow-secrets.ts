/**
 * Workflow secrets — server-side access for job dispatch
 *
 * Secrets are encrypted at rest (AES-256-GCM via workflow-secret-crypto).
 * Values are decrypted ONLY at dispatch time for injection into job
 * containers — never returned by API routes, never logged.
 */
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { decryptWorkflowSecret } from "./workflow-secret-crypto";
import { logger } from "./logger";

export async function listRepoSecrets(
  repositoryId: string,
  environment?: string,
): Promise<Array<{ name: string; value: string; environment: string | null }>> {
  const db = getDatabase() as NodePgDatabase<typeof schema>;
  const rows = await db.query.workflowSecrets.findMany({
    where: environment
      ? (t, { eq: eqFn, and: andFn }) =>
          andFn(
            eqFn(t.repositoryId, repositoryId),
            eqFn(t.environment, environment),
          )
      : (t, { eq: eqFn }) => eqFn(t.repositoryId, repositoryId),
  });

  return rows
    .filter((row) => row.name && row.encryptedValue)
    .map((row) => {
      try {
        return {
          name: row.name,
          value: decryptWorkflowSecret(row.encryptedValue),
          environment: row.environment ?? null,
        };
      } catch (err) {
        logger.error({ err, name: row.name }, "Failed to decrypt workflow secret");
        return null;
      }
    })
    .filter((row): row is { name: string; value: string; environment: string | null } => row !== null);
}
