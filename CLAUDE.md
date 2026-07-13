# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev              # Start Next.js dev server (outputs to .next-dev)

# Build & Deploy
npm run build            # Production build
npm run start            # Start production server (checks required env first)

# Testing
npm test                 # Run all Vitest tests
                         # Note: Tests run sequentially (fileParallelism: false)
                         # to avoid Windows contention on .next directories

# Code Quality
npm run lint             # Run ESLint

# Utilities
npm run canary:email     # Send test email via Brevo (verify email templates)
```

## Architecture Overview

This is a **feature-sliced Next.js application** using:
- **Next.js 16** with App Router
- **SQLite** (better-sqlite3) for data persistence
- **Zod** for request/response validation
- **next-intl** for i18n (ar, en, ru, uk locales)
- **Vitest** for testing

### Feature Slice Structure

All business logic is organized under `src/features/*`. Each feature is self-contained:

```
src/features/<feature>/
  ui/root/           # Public UI exports (barrel)
  useCases/          # Application logic
  domain/            # Types, schemas, business rules
  infra/             # I/O operations (DB, external APIs)
  adapters/next/     # Next.js-specific handlers (route handlers, server actions)
  ports.ts           # Interfaces/contracts
  deps.ts            # Dependency injection wiring
  schema.ts          # Top-level schemas (optional)
```

**Dependency flow:**
```
src/app/**
  -> features/*/adapters/next
     -> features/*/useCases
        -> features/*/ports.ts
           -> features/*/infra
```

### Key Features

- **admin**: Admin panel functionality (Steam ID allowlist-based)
- **apply**: Application submission system
- **steamAuth**: Steam OpenID authentication
- **discordAuth**: Discord OAuth integration
- **callsign/rename**: Player callsign management
- **feed**: Activity feed
- **profile**: User profiles
- **content**: Static content pages
- **outbox**: Email notification queue (processed via cron)

### Platform Layer

`src/platform/*` contains shared infrastructure:
- **db**: SQLite connection, migrations, query builders
- **email**: Brevo integration for transactional emails
- **outbox**: Email queue management
- **apiGates.ts**: Rate limiting, admin auth middleware
- **logger.ts**: Pino-based logging
- **env.ts**: Environment variable validation
- **crypto**: Cryptographic utilities
- **validation**: Shared Zod utilities

### App Routes

- `src/app/[locale]/*`: Localized pages
- `src/app/api/*`: API routes
- All routes are **thin wrappers** - business logic lives in feature use cases

## Core Architectural Rules

1. **No business logic in app routes** - Keep routes thin; delegate to use cases
2. **Next.js specifics stay in adapters** - Don't leak Next.js into use cases
3. **Use cases depend only on ports** - Never import platform or Next.js directly
4. **UI imports go through `ui/root`** - Never import internal UI components directly
5. **Parse at the edge** - Validate all requests/responses with Zod at adapter boundaries
6. **Feature isolation** - Avoid cross-feature imports in use cases
7. **Keep changes scoped** - Modifications should stay within the owning feature slice

## Testing Guidelines

### Test Structure

Tests live in `tests/` (mirroring `src/` structure):
- `tests/features/*`: Feature-specific tests
- `tests/platform/*`: Platform module tests
- `tests/fixtures/*`: Test utilities (DB setup, Next.js helpers)

### Test Patterns

**Preferred: Handler E2E (fast, no build)**
```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../fixtures/isolatedDb';

describe('Feature (handler e2e)', () => {
  beforeAll(async () => {
    await setupIsolatedDb({ prefix: 'my-test' });
  });

  it('works', async () => {
    const { POST } = await import('@/app/api/route');
    const { NextRequest } = await import('next/server');

    const res = await POST(new NextRequest('http://localhost/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'test' })
    }));

    expect(res.status).toBe(200);
  });
});
```

**Full HTTP E2E (when needed)**
- See `tests/E2E.md` for complete template
- Uses isolated dist dirs under `.next-e2e/<id>` to avoid Windows contention
- Always clean up dist dir and temp DB in `afterAll`

**Critical Testing Rules:**
- Always use `setupIsolatedDb()` for database tests
- Set env vars **before** importing route handlers or platform modules
- Never touch `.next` directory in tests (use `.next-e2e/*` for HTTP tests)
- Tests run sequentially to avoid Windows file locking issues

## Environment Variables

See `.env.example` for complete list. Key variables:

**Required for production:**
- `STEAM_WEB_API_KEY`: Steam API integration
- `ADMIN_STEAM_IDS`: Comma/space-separated SteamID64 allowlist
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: Stable Server Actions (self-hosted)
- `OUTBOX_CRON_SECRET`: Cron endpoint authentication
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`: Email notifications

**Development:**
- `DISABLE_RATE_LIMITS=true`: Disable rate limiting
- `LOG_LEVEL=debug`: Verbose logging
- `LOG_PRETTY=true`: Human-readable logs

**Database:**
- `DB_PATH`: Override SQLite path (default: `./database/applications.db`)

## Database

- **Engine**: SQLite via better-sqlite3
- **Location**: `database/applications.db` (or `DB_PATH` env var)
- **Access**: All database interactions go through `@/platform/db`
- **Tests**: Use `tests/fixtures/isolatedDb` for test databases (never import `@/platform/db` directly in tests)

## Internationalization

- **Library**: next-intl
- **Locales**: `ar`, `en`, `ru`, `uk`
- **Message files**: `messages/<locale>.json`
- **Content**: Static content in `content/` (guides, rules, important notices)

## Steam Integration

- Uses Steam OpenID for authentication
- `x-forwarded-proto` and `x-forwarded-host` headers required (set by nginx in production)
- Steam API calls for ownership verification and persona lookup

## Email System

- **Provider**: Brevo (transactional email)
- **Pattern**: Outbox pattern for async email processing
- **Cron**: `/api/cron/outbox` endpoint triggered by cron container
- **Test**: Use `npm run canary:email` to verify email templates

## Deployment

- **Container**: Docker + nginx (TLS termination)
- **Files**: `Dockerfile`, `docker-compose.yml`, `nginx/default.conf`
- **Start**: `docker compose up -d --build`
- **TLS**: Let's Encrypt via certbot on the host (webroot mode), see DEPLOYMENT.md
- **Ports**: nginx on 80/443, Next.js internal on 3000

See `DEPLOYMENT.md` for complete deployment instructions.

## Development Tips

- **Path alias**: Use `@/*` for all imports from `src/`
- **Dev server**: Outputs to `.next-dev` to avoid conflicts with test builds
- **Logging**: Structured JSON logs via Pino (pretty-printed in dev with `LOG_PRETTY=true`)
- **Rate limiting**: Configured in `platform/rateLimit.ts`, disabled via `DISABLE_RATE_LIMITS`
- **Admin access**: Protected by Steam login + `ADMIN_STEAM_IDS` allowlist

## Special Files

- **instrumentation.ts**: Process-level error handlers (Edge-compatible)
- **ARCHITECTURE.md**: Detailed architecture documentation
- **tests/E2E.md**: E2E testing patterns and templates
