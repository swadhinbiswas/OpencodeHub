/**
 * SCIM 2.0 (System for Cross-domain Identity Management) Protocol Implementation
 * RFC 7643 (Core Schema) & RFC 7644 (Protocol)
 * Supports directory sync from identity providers like Okta, Azure AD, Ping, OneLogin
 */

import { getDatabase, schema } from "@/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, like } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./utils";

// SCIM Schemas
export const SCIM_SCHEMAS = {
    USER: "urn:ietf:params:scim:schemas:core:2.0:User",
    GROUP: "urn:ietf:params:scim:schemas:core:2.0:Group",
    LIST_RESPONSE: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
    ERROR: "urn:ietf:params:scim:api:messages:2.0:Error",
    PATCH_OP: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
};

export interface SCIMEmail {
    value: string;
    type?: string;
    primary?: boolean;
}

export interface SCIMName {
    formatted?: string;
    familyName?: string;
    givenName?: string;
}

export interface SCIMUserResource {
    schemas: string[];
    id: string;
    userName: string;
    name?: SCIMName;
    displayName?: string;
    emails: SCIMEmail[];
    active: boolean;
    meta: {
        resourceType: "User";
        created: string;
        lastModified: string;
        location: string;
    };
}

export interface SCIMGroupMember {
    value: string; // User ID
    $ref?: string;
    display?: string;
}

export interface SCIMGroupResource {
    schemas: string[];
    id: string;
    displayName: string;
    members: SCIMGroupMember[];
    meta: {
        resourceType: "Group";
        created: string;
        lastModified: string;
        location: string;
    };
}

export interface SCIMListResponse<T> {
    schemas: string[];
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    Resources: T[];
}

export interface SCIMErrorResponse {
    schemas: string[];
    status: string;
    detail: string;
    scimType?: string;
}

/**
 * Format a database user into a SCIM 2.0 User resource
 */
export function formatSCIMUser(user: any, baseUrl: string): SCIMUserResource {
    return {
        schemas: [SCIM_SCHEMAS.USER],
        id: user.id,
        userName: user.username,
        displayName: user.displayName || user.username,
        name: {
            formatted: user.displayName || user.username,
        },
        emails: [
            {
                value: user.email,
                type: "work",
                primary: true,
            },
        ],
        active: !user.isSuspended,
        meta: {
            resourceType: "User",
            created: new Date(user.createdAt).toISOString(),
            lastModified: new Date(user.updatedAt || user.createdAt).toISOString(),
            location: `${baseUrl}/api/scim/v2/Users/${user.id}`,
        },
    };
}

/**
 * Format a database team into a SCIM 2.0 Group resource
 */
export function formatSCIMGroup(team: any, members: any[], baseUrl: string): SCIMGroupResource {
    return {
        schemas: [SCIM_SCHEMAS.GROUP],
        id: team.id,
        displayName: team.name,
        members: members.map((m) => ({
            value: m.userId,
            display: m.username || m.userId,
            $ref: `${baseUrl}/api/scim/v2/Users/${m.userId}`,
        })),
        meta: {
            resourceType: "Group",
            created: new Date(team.createdAt).toISOString(),
            lastModified: new Date(team.createdAt).toISOString(),
            location: `${baseUrl}/api/scim/v2/Groups/${team.id}`,
        },
    };
}

/**
 * Format SCIM Error response
 */
export function createSCIMError(status: number, detail: string, scimType?: string): SCIMErrorResponse {
    return {
        schemas: [SCIM_SCHEMAS.ERROR],
        status: status.toString(),
        detail,
        scimType,
    };
}

/**
 * Create a user via SCIM 2.0
 */
export async function scimCreateUser(payload: Partial<SCIMUserResource>, baseUrl: string) {
    if (!payload.userName || !payload.emails || payload.emails.length === 0) {
        throw new Error("userName and email are required for SCIM user creation");
    }

    const email = payload.emails[0].value;
    const username = payload.userName;
    const displayName = payload.displayName || payload.name?.formatted || username;
    const active = payload.active ?? true;

    const db = getDatabase() as NodePgDatabase<typeof schema>;

    // Check for existing user
    const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
    });

    if (existing) {
        logger.info({ userId: existing.id, email }, "SCIM provision matched existing user");
        return formatSCIMUser(existing, baseUrl);
    }

    const userId = generateId();
    const newUser = {
        id: userId,
        username,
        email,
        displayName,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(schema.users).values(newUser);
    logger.info({ userId, email }, "SCIM user created");

    return formatSCIMUser(newUser, baseUrl);
}

/**
 * Update/Deactivate a user via SCIM 2.0
 */
export async function scimUpdateUser(userId: string, payload: Partial<SCIMUserResource>, baseUrl: string) {
    const db = getDatabase() as NodePgDatabase<typeof schema>;

    const existing = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
    });

    if (!existing) {
        return null;
    }

    const updates: Record<string, any> = {
        updatedAt: new Date(),
    };

    if (payload.displayName) updates.displayName = payload.displayName;
    if (payload.emails && payload.emails.length > 0) updates.email = payload.emails[0].value;

    await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));

    const updated = { ...existing, ...updates };
    return formatSCIMUser(updated, baseUrl);
}
