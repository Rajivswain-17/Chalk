import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** One registered Chalk user. Password OR OAuth (or both) unlocks the account. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Display name from signup or OAuth profile. Shown in the client header. */
  name: text("name").notNull(),
  /** Lowercased at write time (code-enforced); unique key for credential login. */
  email: text("email").notNull().unique(),
  /** bcrypt hash. Null for OAuth-only accounts — login rejects empty passwords. */
  passwordHash: text("password_hash"),
  /** OAuth profile picture. Null for credential-only accounts. */
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** External identity linked to a user (Google / GitHub via manual OAuth2). */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "google" | "github". New providers need no migration (free-form text). */
    provider: text("provider").notNull(),
    /** Provider-side subject (`sub` / numeric id as string). */
    providerUserId: text("provider_user_id").notNull(),
    /** Profile email at link time (informational; users.email stays canonical). */
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One provider identity maps to exactly one user — blocks double-linking.
    providerIdentity: uniqueIndex("oauth_accounts_provider_identity_uidx").on(
      table.provider,
      table.providerUserId,
    ),
    userProviderIndex: index("oauth_accounts_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  }),
);

/**
 * Refresh-token family for cookie rotation. Only sha256 hashes persist here —
 * the raw token lives solely in the `chalk_rt` httpOnly cookie. Rotation
 * inserts a successor row and stamps the parent revokedAt; presenting an
 * already-revoked token signals theft → the whole family is revoked.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Hex sha256 of the opaque token. Unique → replay is a key lookup. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set on rotation or logout. Null = live. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIndex: index("refresh_tokens_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
