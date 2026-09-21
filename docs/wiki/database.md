# Database Schema

## Overview

Chalk utilizes **PostgreSQL 16** managed through **Drizzle ORM** with the `postgres-js` client. Schema definitions are located in `server/src/repository/schema/` and data access operations are centralized in `server/src/repository/index.ts`.

Connection Pool Settings:
- Max Connections: `10`
- Idle Timeout: `20s`
- Connect Timeout: `10s`

---

## Tables

### 1. `users`

Stores primary user accounts for both email/password credentials and OAuth providers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` | Unique user identifier |
| `name` | `text` | NOT NULL | Display name |
| `email` | `text` | NOT NULL, UNIQUE | Canonical email address (lowercased) |
| `password_hash` | `text` | Nullable | bcrypt hash (null for OAuth-only users) |
| `avatar_url` | `text` | Nullable | Profile avatar image URL |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Account creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Last modification timestamp |

TypeScript Models: `User`, `NewUser`

---

### 2. `oauth_accounts`

Links third-party OAuth identities (Google, GitHub) to internal user accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` | Unique record identifier |
| `user_id` | `uuid` | NOT NULL, FK -> `users.id` ON DELETE CASCADE | Associated user |
| `provider` | `text` | NOT NULL | Provider name (`"google"` or `"github"`) |
| `provider_user_id` | `text` | NOT NULL | Provider's external subject ID |
| `email` | `text` | Nullable | Email address supplied by the OAuth provider |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Linking timestamp |

Indexes & Constraints:
- `oauth_accounts_provider_identity_uidx`: Unique index on `(provider, provider_user_id)` preventing duplicate provider bindings.
- `oauth_accounts_user_provider_idx`: Index on `(user_id, provider)`.

TypeScript Model: `OAuthAccount`

---

### 3. `refresh_tokens`

Implements secure refresh token rotation. Only SHA-256 hashes of the tokens are stored in the database; raw tokens exist exclusively within the client's `chalk_rt` httpOnly cookie.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` | Token entry ID |
| `user_id` | `uuid` | NOT NULL, FK -> `users.id` ON DELETE CASCADE | Associated user ID |
| `token_hash` | `text` | NOT NULL, UNIQUE | Hex-encoded SHA-256 hash of token |
| `expires_at` | `timestamptz` | NOT NULL | Expiration timestamp (30 days) |
| `revoked_at` | `timestamptz` | Nullable | Revocation timestamp (null = active) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |

Index: `refresh_tokens_user_created_idx` on `(user_id, created_at)`.

#### Token Reuse Detection & Theft Defense
If a refresh token with a non-null `revoked_at` timestamp is presented to `/api/auth/refresh`, the server detects token theft and immediately revokes all active tokens for that user via `revokeAllUserRefreshTokens()`.

---

### 4. `videos` (Legacy)

Maintained for backwards-compatibility with the previous Remotion/HLS video pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` | Video project identifier |
| `user_id` | `uuid` | FK -> `users.id` ON DELETE CASCADE | Project owner |
| `title` | `text` | NOT NULL | Video title |
| `prompt` | `text` | NOT NULL | Generation prompt |
| `status` | `enum(video_status)` | NOT NULL, default `pending` | `pending`, `processing`, `completed`, `failed` |
| `aspect_ratio` | `enum(aspect_ratio)` | NOT NULL, default `16:9` | `16:9` or `9:16` |
| `output_url` | `text` | Nullable | HLS playlist URL (.m3u8) |
| `total_scenes` | `integer` | Nullable, CHECK >= 0 | Scene count |
| `completed_scenes` | `integer` | NOT NULL, default 0 | Rendered scene count |
| `error_message` | `text` | Nullable | Failure reason if any |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Update timestamp |

---

### 5. `generation_jobs` (Legacy)

Tracks asynchronous worker jobs for legacy video rendering.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, `defaultRandom()` | Job record ID |
| `video_id` | `uuid` | NOT NULL, FK -> `videos.id` ON DELETE CASCADE | Associated video |
| `bullmq_job_id` | `text` | UNIQUE | BullMQ queue job identifier |
| `status` | `enum(job_status)` | NOT NULL, default `queued` | `queued`, `active`, `retrying`, `completed`, `failed` |
| `current_stage` | `text` | Nullable | Current worker phase |
| `progress` | `integer` | NOT NULL, default 0, CHECK 0-100 | Progress percentage |
| `error_message` | `text` | Nullable | Error log on failure |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Enqueue timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | State transition timestamp |

---

## Enums

```sql
CREATE TYPE video_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE job_status AS ENUM ('queued', 'active', 'retrying', 'completed', 'failed');
CREATE TYPE aspect_ratio AS ENUM ('16:9', '9:16');
```

---

## Entity Relationship Diagram

```
+--------------------+           +------------------------+
|       users        | 1       N |     oauth_accounts     |
|--------------------|<----------|------------------------|
| id (PK)            |           | id (PK)                |
| email (UNIQUE)     |           | user_id (FK -> users)  |
| password_hash      |           | provider               |
| name, avatar_url   |           | provider_user_id       |
+--------------------+           +------------------------+
       | 1
       |
       | N
+------------------------+
|     refresh_tokens     |
|------------------------|
| id (PK)                |
| user_id (FK -> users)  |
| token_hash (UNIQUE)    |
| expires_at, revoked_at |
+------------------------+
       | 1 (Legacy)
       |
       | N
+------------------------+       1       N +-----------------------+
|        videos          |<----------------|    generation_jobs    |
|------------------------|                 |-----------------------|
| id (PK)                |                 | id (PK)               |
| user_id (FK -> users)  |                 | video_id (FK)         |
| status, output_url     |                 | status, progress      |
+------------------------+                 +-----------------------+
```

---

## Repository Functions (`server/src/repository/index.ts`)

### User Operations
- `createUser(data)`: Inserts new user record.
- `getUserByEmail(email)`: Fetches user by lowercased canonical email.
- `getUserById(id)`: Fetches user by UUID.
- `toPublicUser(user)`: Sanitizes user model into safe `{ id, name, email, avatarUrl }`.
- `canonicalEmail(email)`: Trims and lowercases input email.

### OAuth Operations
- `getOAuthAccount(provider, providerUserId)`: Retrieves linked external account.
- `linkOAuthAccount(data)`: Persists new OAuth identity linkage.

### Refresh Token Operations
- `createRefreshToken(data)`: Inserts new hashed refresh token.
- `getRefreshToken(tokenHash)`: Retrieves token by SHA-256 hash.
- `revokeRefreshToken(id)`: Sets `revoked_at = now()`.
- `revokeAllUserRefreshTokens(userId)`: Revokes entire token family upon reuse detection.
