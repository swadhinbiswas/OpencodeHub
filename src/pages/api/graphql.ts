/**
 * GraphQL API Endpoint
 * Powered by GraphQL Yoga
 */

import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { resolvers, typeDefs, type GraphQLContext } from "@/lib/graphql";
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSchema, createYoga } from "graphql-yoga";

// Create GraphQL schema
const graphqlSchema = createSchema({
  typeDefs,
  resolvers,
});

// Create Yoga instance
const yoga = createYoga<{ request: Request }>({
  schema: graphqlSchema,
  graphqlEndpoint: "/api/graphql",

  // CORS settings — restrict to configured origins (fall back to same-origin)
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },

  // Context factory
  context: async ({ request }): Promise<GraphQLContext> => {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Get authenticated user if present
    const tokenPayload = await getUserFromRequest(request);
    let user = undefined;

    if (tokenPayload?.userId) {
      user =
        (await db.query.users.findFirst({
          where: eq(schema.users.id, tokenPayload.userId),
        })) || undefined;
    }

    return {
      db,
      userId: tokenPayload?.userId,
      user,
    };
  },
});

// Handle all GraphQL requests
const handler: APIRoute = async ({ request }) => {
  return yoga.handle(request);
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
