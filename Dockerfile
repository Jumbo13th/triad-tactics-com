# syntax=docker/dockerfile:1

# Multi-stage build for Next.js + better-sqlite3

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 needs build tooling
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN useradd -m -u 1001 nodejs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Persist SQLite DB here (mount a volume in docker-compose)
RUN mkdir -p /app/database && chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3000

CMD ["npm", "run", "start"]
