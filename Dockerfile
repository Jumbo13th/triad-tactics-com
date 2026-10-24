# syntax=docker/dockerfile:1

# Multi-stage build for Next.js + better-sqlite3

FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS deps
WORKDIR /app

# better-sqlite3 13 bundles native binaries; keep package.json allowScripts.
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS production-deps
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf /app/.next/cache

FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Include current Debian fixes even between base-image rebuilds.
# Production starts Node directly; omit the package manager and its dependencies.
RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && useradd -m -u 1001 nodejs \
  && install -d -o nodejs -g nodejs /app/database

COPY --from=production-deps --chown=nodejs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=nodejs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nodejs:nodejs /app/messages ./messages
COPY --from=builder --chown=nodejs:nodejs /app/content ./content
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/.next ./.next
COPY --from=production-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 3000

CMD ["sh", "-c", "node scripts/checkRequiredEnv.mjs && exec node node_modules/next/dist/bin/next start"]
