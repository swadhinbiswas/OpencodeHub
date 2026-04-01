import type { APIRoute } from "astro";
import { db } from "../../../../../../../db/index";
import { stackedPrs } from "../../../../../../../db/schema/stacked-prs";
import { eq } from "drizzle-orm";

export const GET: APIRoute = async ({ params }) => {
  const prId = Number(params.id);
  
  if (isNaN(prId)) {
    return new Response("Invalid PR ID", { status: 400 });
  }

  try {
    const selfPr = await db.select().from(stackedPrs).where(eq(stackedPrs.prId, prId)).limit(1);
    
    if (selfPr.length === 0) {
      return new Response(JSON.stringify({ isStacked: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const stackId = selfPr[0].stackId;
    const fullStack = await db.select().from(stackedPrs).where(eq(stackedPrs.stackId, stackId));
    
    return new Response(JSON.stringify({ isStacked: true, stackId, items: fullStack }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response("Internal Server Error retrieving stack-graph", { status: 500 });
  }
};
