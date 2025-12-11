import { getDatabase } from "@/db";
import { sshKeys } from "@/db/schema";
import { notFound, serverError, success, unauthorized } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    const tokenPayload = await getUserFromRequest(request);
    if (!tokenPayload) {
      return unauthorized();
    }

    const { id } = params;
    if (!id) {
      return notFound("Key ID is required");
    }

    const db = getDatabase();

    // Delete key ensuring it belongs to the user
    const result = await db
      .delete(sshKeys)
      .where(and(eq(sshKeys.id, id), eq(sshKeys.userId, tokenPayload.userId)))
      .returning();

    if (result.length === 0) {
      return notFound("SSH key not found or not authorized");
    }

    return success({ message: "SSH key deleted successfully" });
  } catch (error) {
    console.error("Delete SSH key error:", error);
    return serverError("Failed to delete SSH key");
  }
};
