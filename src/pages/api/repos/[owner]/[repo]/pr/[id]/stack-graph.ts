import type { APIRoute } from "astro";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params }) => {
  const prId = params.id;
  
  if (!prId) {
    return new Response("Invalid PR ID", { status: 400 });
  }

  const db = getDatabase();
  try {
    const selfPr = await db.query.prStackEntries.findFirst({
      where: eq(schema.prStackEntries.pullRequestId, prId),
    });
    
    if (!selfPr) {
      return new Response(JSON.stringify({ isStacked: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const stackId = selfPr.stackId;
    const fullStack = await db.query.prStackEntries.findMany({
      where: eq(schema.prStackEntries.stackId, stackId),
    });
    
    return new Response(JSON.stringify({ isStacked: true, stackId, items: fullStack }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response("Internal Server Error retrieving stack-graph", { status: 500 });
  }
};
