# ============================================================================
# Chalk — Backend Dockerfile (development)
# ----------------------------------------------------------------------------
# Lives in: Chalk/server/Dockerfile
# Built by: Chalk/docker-compose.yml → service "server" (context: ./server)
# NOTE: Step brief said "Chalk/Dockerfile", but compose uses
#       `context: ./server` + `dockerfile: Dockerfile`, so the file MUST live
#       inside ./server/ or `docker compose build` will fail. Placed here
#       intentionally to match compose.
# ============================================================================

# --- Base image -------------------------------------------------------------
# node:20-slim = Debian slim + Node 20 LTS.
# Why slim and not alpine: Remotion / FFmpeg / Chromium need glibc shared
# libs (fonts, NSS). Alpine (musl) breaks Chromium + canvas prebuilds.
# Why Node 20: matches Remotion + BullMQ + Drizzle LTS support.
FROM node:20-slim

# --- System dependencies ----------------------------------------------------
# ffmpeg:              HLS packaging (seg_001.ts + playlist.m3u8) + audio concat.
# chromium:            Headless browser for Remotion rendering (compositor).
# wget:                Healthchecks / fetching remote assets in dev.
# ca-certificates:     TLS for OpenAI / ElevenLabs / Iconify API calls.
# fonts-liberation:    Deterministic text metrics in Chromium canvas.
#                      Without this, Rough.js text bboxes shift between runs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    wget \
    ca-certificates \
    fonts-liberation \
  # Keep image small: drop apt caches (they are never needed at runtime).
  && rm -rf /var/lib/apt/lists/*

# --- Browser env ------------------------------------------------------------
# Remotion (+ Puppeteer-core style launchers) auto-downloads Chromium unless
# told not to. We already installed system Chromium above, so:
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true → never fetch a second browser.
# CHROMIUM_PATH=/usr/bin/chromium      → single source of truth for the
#   compositor (services/compositor/remotionRenderer.ts reads this).
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

# --- Workdir ----------------------------------------------------------------
# All subsequent COPY / RUN / CMD paths are relative to /app.
# Compose mounts ./server:/app over this in dev, so /app == repo server/.
WORKDIR /app

# --- Dependency layer (cached) ----------------------------------------------
# Copy ONLY manifests first. Docker caches this layer: `npm install` re-runs
# ONLY when package.json / package-lock.json change, not on every .ts edit.
# This is what keeps `docker compose up --build` fast during development.
COPY package.json package-lock.json ./

# Install all deps (devDeps included) because CMD runs `npm run dev`
# (tsx / typescript live-reload). A production Dockerfile would use `npm ci`.
RUN npm install

# --- Source layer -----------------------------------------------------------
# Copy the rest of the backend (src/, tsconfig.json, drizzle.config.ts...).
# In dev this is overlaid by the bind-mount ./server:/app, but the COPY still
# matters for: (a) first build before mount, (b) `docker run` without compose.
COPY . .

# --- Networking -------------------------------------------------------------
# Express listens on PORT=3001 (see ../.env). EXPOSE is documentation-only;
# the actual publish happens in docker-compose.yml ports: "3001:3001".
EXPOSE 3001

# --- Default command --------------------------------------------------------
# Dev hot-reload (e.g. `tsx watch src/index.ts`). Overridden in production
# by `npm run build && npm start` or a worker CMD for BullMQ.
CMD ["npm", "run", "dev"]
