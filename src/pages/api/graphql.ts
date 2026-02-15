/**
 * GraphQL API Endpoint
 * Powered by GraphQL Yoga
 */

import type { APIRoute } from "astro";
import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs, resolvers, type GraphQLContext } from "@/lib/graphql";
import { getDatabase, schema } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

// Create GraphQL schema
const graphqlSchema = createSchema({
    typeDefs,
    resolvers,
});

// Create Yoga instance
const yoga = createYoga<{ request: Request }>({
    schema: graphqlSchema,
    graphqlEndpoint: "/api/graphql",

    // CORS settings
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    },

    // Context factory
    context: async ({ request }): Promise<GraphQLContext> => {
        const db = getDatabase() as NodePgDatabase<typeof schema>;

        // Get authenticated user if present
        const tokenPayload = await getUserFromRequest(request);
        let user = undefined;

        if (tokenPayload?.userId) {
            user = await db.query.users.findFirst({
                where: eq(schema.users.id, tokenPayload.userId),
            }) || undefined;
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
