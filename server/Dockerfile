FROM node:22-bookworm-slim

# FFmpeg/ffprobe package scenes and inspect durations. Chromium renders Remotion
# frames; dumb-init forwards Docker signals so the API and worker can drain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg chromium dumb-init wget ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV NODE_ENV=development

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN mkdir -p /app/output /app/cache/icons \
  && chown -R node:node /app/output /app/cache

USER node
EXPOSE 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev:api"]
