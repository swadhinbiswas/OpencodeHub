import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Organization membership invites (WS3-02):
 * owner/admin creates an invite (by email or username); the invitee accepts
 * via a token link and becomes a member.
 */
export const orgInvites = pgTable(
  "org_invites",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Either email or userId is set
    email: text("email"),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // member, admin
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("pending"), // pending, accepted, revoked
    expiresAt: timestamp("expires_at"),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("org_invites_org_idx").on(t.organizationId),
    statusIdx: index("org_invites_status_idx").on(t.status),
  }),
);
