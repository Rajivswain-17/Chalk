# Chalk - Agent Wiki

> **Chalk** is a full-stack AI-powered visual explainer engine. Users submit a
> natural-language prompt in a chat interface, the backend calls OpenAI to
> generate structured step-by-step visualization data, and the frontend renders
> an interactive, zero-blink, dark-themed visual player (inspired by
> [dsa.chaicode.com](https://dsa.chaicode.com)) - all without heavy client/server video rendering.

---

## Table of Contents

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | System architecture, server/client layout, Docker setup, and data flow |
| [database.md](./database.md) | All PostgreSQL schemas (Drizzle ORM), tables, relationships, and types |
| [api.md](./api.md) | All REST API endpoints (Auth, Visualize, ElevenLabs integration, request/response schemas) |
| [components.md](./components.md) | All client React components, hooks, providers, and state management |

---

## Quick Facts

| Property | Value |
|----------|-------|
| **Server** | Express 4 + TypeScript, port `3001` |
| **Client** | Next.js 16.3.5 + React 19 + Tailwind CSS v4 + shadcn/ui |
| **Database** | PostgreSQL 16 via Drizzle ORM (postgres-js driver) |
| **Cache** | Valkey 7 (Redis-compatible) |
| **AI** | OpenAI Structured Outputs (`zodResponseFormat`) via `openai` SDK |
| **Voice / TTS** | ElevenLabs API (`eleven_multilingual_v2`) with character/word timestamp alignments |
| **Auth** | Cookie-based JWT (15min access + 30d rotating refresh + CSRF protection) |
| **OAuth** | Google + GitHub (direct OAuth2 flow, no Passport) |
| **Animation** | Framer Motion (`layoutId` sliding, spring transitions) |
| **Containers** | Docker Compose (postgres, valkey, migrate, api) |

---

## Repository Layout

```
Chalk/
|-- .env                          # Shared environment variables
|-- docker-compose.yml            # PostgreSQL, Valkey, migrate, api services
|-- docs/
|   |-- wiki/                     # Agent-First Wiki (this documentation)
|   `-- superpowers/plans/        # Architecture plans and redesign docs
|-- server/
|   |-- Dockerfile                # Node 22 bookworm-slim + FFmpeg + Chromium
|   `-- src/
|       |-- index.ts              # Express application entry point
|       |-- controllers/          # auth.controller.ts
|       |-- middleware/           # requireAuth, requireCsrf, requireVideoOwner
|       |-- routes/               # auth.routes.ts, visualize.routes.ts
|       |-- services/             # auth/, visualize.service.ts, voice/, icons/
|       |-- repository/           # Drizzle DB operations + schema/
|       |-- lib/                  # db, env, redis, session, openai, password
|       |-- validators/           # Zod schemas (auth, video, visualize)
|       `-- types/                # Core TypeScript interfaces
`-- client/
    `-- src/
        |-- proxy.ts              # Next.js middleware route guards
        |-- app/                  # Pages: /, /generate, /login, /signup, /how-it-works
        |-- components/
        |   |-- ChatWorkspace.tsx # Main chat arena with sidebar + inline player
        |   |-- visual/           # 5-zone visual explainer components
        |   `-- ui/               # shadcn/ui primitives
        |-- hooks/                # useVisualPlayer.ts
        `-- lib/                  # auth.tsx, auth-client.ts, visualize.ts
```
