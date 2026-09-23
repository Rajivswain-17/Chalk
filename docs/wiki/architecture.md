# Architecture

## System Overview

Chalk is a monorepo composed of a high-performance Express API backend, a Next.js 16 frontend, and containerized backing services.

### High-Level Request Flow

```
Browser (localhost:3000)
    |
    |  Next.js SSR + Client Components (React 19, Tailwind v4)
    |  Cookie-based auth (chalk_at, chalk_rt, chalk_csrf)
    |
    +--> POST /api/visualize (via apiFetch with CSRF header)
         |
Express API Server (localhost:3001)
    |
    |-- requireAuth (JWT verification from chalk_at cookie)
    |-- requireCsrf (double-submit verification: chalk_csrf cookie vs x-csrf-token)
    |-- Zod validation (visualizeRequestSchema)
    `-- OpenAI Structured Outputs (OPENAI_MODEL: code default gpt-4o, dev .env sets gpt-4o-mini; zodResponseFormat)
         |
         `-- Returns 6-12 VisualStep objects
             (title, stageType, elements[], codeLines[],
              activeLine, variables[], explanation)

Browser renders VisualExplainer (5-zone interactive player)
    Zone 1: Header + StepDots (step-by-step navigation)
    Zone 2: ArrayStage or TreeStage (canvas container never unmounts - zero blink)
    Zone 3: CodePanel (sliding active line pill via Framer Motion)
    Zone 4: VariableBadges (runtime variables)
    Zone 5: CaptionBar + ControlsBar (play/pause, scrub, speed, fullscreen)
```

---

## Server Architecture

### Entry Point: `server/src/index.ts`

The Express application initializes the middleware chain in strict order:

1. **CORS** - Whitelisted origin from `CORS_ORIGIN` env, `credentials: true`
2. **Helmet** - Hardened HTTP security headers
3. **Morgan** - Request logging (`dev` mode in local, `combined` in production)
4. **express.json** - JSON body parser with 64kb limit
5. **cookieParser** - Populates `req.cookies` for JWT, refresh token, and CSRF tokens

### Route Mounting

| Path | Router | Middleware / Protection |
|------|--------|--------------------------|
| `/api/auth/*` | `auth.routes.ts` | Endpoint-specific rate limiting and guards |
| `/api/visualize` | `visualize.routes.ts` | `requireAuth` + `requireCsrf` + Rate limit (10/hr) |
| `/health/live` | Inline handler | Public (returns 200 OK) |
| `/health/ready` | Inline handler | Public (validates DB pool & Redis ping) |

### Service Layer

| Service | File | Description |
|---------|------|-------------|
| **Auth** | `services/auth/index.ts` | Credentials signup/login, session refresh, logout, OAuth (Google/GitHub). Issues 15-min JWT access tokens and 30-day rotating refresh tokens (sha256-hashed in DB). Implements reuse detection to instantly revoke compromised session families. |
| **Visualize** | `services/visualize.service.ts` | Calls `openai.beta.chat.completions.parse()` with `zodResponseFormat(llmPlanSchema, 'visual_plan')`. Validates response structure via Zod, attaches zero-based `stepIndex`, and returns `VisualStep[]`. |
| **Voice (TTS)** | `services/voice/elevenlabs.ts` | Synthesizes voice audio with character/word timestamps via ElevenLabs `eleven_multilingual_v2` model. Persists generated MP3s and timestamp metadata. |
| **Icons** | `services/icons/` | Icon resolver utilities for Lucide and Iconify asset management. |

### Middleware

| Middleware | File | Purpose |
|------------|------|---------|
| `requireAuth` | `middleware/requireAuth.ts` | Extracts JWT from `chalk_at` cookie, validates signature with `JWT_SECRET`, assigns `req.userId`. Responds with 401 if invalid. |
| `requireCsrf` | `middleware/requireCsrf.ts` | Compares `chalk_csrf` cookie with `x-csrf-token` header using `crypto.timingSafeEqual`. Responds with 403 on mismatch. |
| `requireVideoOwner` | `middleware/requireVideoOwner.ts` | Ownership guard for legacy video assets. |

### Library Modules

| Module | File | Purpose |
|--------|------|---------|
| `db.ts` | `lib/db.ts` | Drizzle ORM instance over `postgres` (max 10 connections, 20s idle timeout) |
| `env.ts` | `lib/env.ts` | Strictly validated environment configuration powered by Zod |
| `redis.ts` | `lib/redis.ts` | Valkey (Redis-compatible) client instance with reconnection strategies |
| `session.ts` | `lib/session.ts` | JWT signing/verification, opaque refresh token generation, hashing, and cookie helpers |
| `openai.ts` | `lib/openai.ts` | OpenAI API client instantiation and model configuration |
| `password.ts` | `lib/password.ts` | Secure password hashing and verification using `bcrypt` (cost factor 12) |

### Process Lifecycle & Graceful Shutdown

On receiving `SIGTERM` or `SIGINT`:
1. Closes HTTP server to stop accepting new requests.
2. Closes Valkey / Redis client connections.
3. Drains and shuts down PostgreSQL connection pool.
4. Hard timeout of 15 seconds forces termination if drains stall.

---

## Client Architecture

### Framework: Next.js 16.3.5 (App Router + Turbopack)

- Uses React 19 with Server Components for layout structure and Client Components for dynamic visual state.
- Route middleware (`proxy.ts`) enforces cookie presence checks on edge routes.

### Page Routes

| Route | Component | Access Control |
|-------|-----------|----------------|
| `/` | `ChatWorkspace` | Authenticated (redirects to `/login` if unauthenticated) |
| `/generate` | `PromptForm` | Authenticated |
| `/login` | `AuthForm` (mode: login) | Public / Guest-only (redirects to `/generate` if logged in) |
| `/signup` | `AuthForm` (mode: signup) | Public / Guest-only (redirects to `/generate` if logged in) |
| `/how-it-works` | Informational Page | Public |

### State Management

| State Domain | Storage | Mechanism |
|--------------|---------|-----------|
| **User Profile / Auth** | React Context | `AuthProvider` initializes via `GET /api/auth/me` |
| **Chat History** | `localStorage` | Key: `chalk_recent_chats_v2` (holds up to 30 sessions) |
| **Visual Plan Data** | Component State | Fetched per chat session via `fetchVisualization()` |
| **Playback State** | React Hook | `useVisualPlayer` manages current step, play/pause, scrub, speed |

### API Client: `apiFetch()`

Located in `client/src/lib/auth-client.ts`:
1. Always includes credentials (`credentials: 'include'`).
2. Automatically extracts `chalk_csrf` cookie and sends `x-csrf-token` header for state-mutating requests.
3. Automatically catches `401 Unauthorized`, initiates a silent token rotation via `POST /api/auth/refresh`, and retries the original request once.
4. On refresh failure, dispatches `chalk:auth-lost` event to trigger logout UI.

---

## Docker Architecture

### Services (`docker-compose.yml`)

| Service | Image / Source | Role | Port Mapping |
|---------|----------------|------|--------------|
| `postgres` | `postgres:16-alpine` | Relational database (user: `chalk`, database: `chalk`) | `5432:5432` (localhost) |
| `valkey` | `valkey/valkey:7-alpine` | In-memory key-value cache and session store | `6379:6379` (localhost) |
| `migrate` | `server/Dockerfile` | Runs `npm run db:migrate` and exits | None |
| `api` | `server/Dockerfile` | Express API web service (`npm run dev:api`) | `3001:3001` |

### Volumes & Persistence

- `postgres_data` -> Database records
- `valkey_data` -> Valkey AOF cache snapshots
- `output_data` -> Legacy video and audio export store
- `icon_cache` -> Cached vector icon assets

### Startup Dependency Flow

```
[postgres: healthy] + [valkey: healthy]
          |
          v
      [migrate]  (runs Drizzle schema migrations)
          |
          v
        [api]    (starts Express server on :3001)
```

---

## Environment Variables Reference

Defined in root `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://chalk:chalk@localhost:5432/chalk` | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Valkey / Redis connection URI |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for visualization generation |
| `OPENAI_MODEL` | No | `gpt-4o` (root `.env` overrides to `gpt-4o-mini` for cheap dev/testing — flip back to `gpt-4o` for best-quality generations) | Model used for Structured Outputs |
| `ELEVENLABS_API_KEY` | Optional | - | API key for ElevenLabs TTS voice synthesis |
| `ELEVENLABS_VOICE_ID` | No | `21m00Tcm4TlvDq8ikWAM` | Default voice ID for narration |
| `JWT_SECRET` | Yes (prod) | `dev-only-jwt-secret-change-me` | Signing key for session JWTs |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed frontend origin |
| `GOOGLE_CLIENT_ID` | Optional | - | OAuth2 client ID for Google sign-in |
| `GOOGLE_CLIENT_SECRET`| Optional | - | OAuth2 client secret for Google sign-in |
| `GITHUB_CLIENT_ID` | Optional | - | OAuth2 client ID for GitHub sign-in |
| `GITHUB_CLIENT_SECRET`| Optional | - | OAuth2 client secret for GitHub sign-in |
| `APP_URL` | No | `http://localhost:3001` | Backend URL for OAuth redirects |
| `CLIENT_URL` | No | `http://localhost:3000` | Frontend URL for user redirects |
