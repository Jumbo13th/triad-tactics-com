# E2E tests (recommended patterns)

This repo has two “end-to-end-ish” styles. Prefer the cheaper one whenever possible.

## 1) Preferred: handler E2E (no `next build`, no server)

Use when you can exercise the behavior by calling route handlers directly (fast, deterministic, Windows-friendly).

Key rules:
- Always use an isolated DB fixture: `setupIsolatedDb()`.
- Set env **before** importing route handlers or platform modules.
- Use `NextRequest` from `next/server` to model real requests.

Template:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../fixtures/isolatedDb';

describe('My feature (handler e2e)', () => {
  beforeAll(async () => {
    await setupIsolatedDb({
      prefix: 'my-feature-handler-e2e',
      // adminSteamIds: '7656...',
    });
  });

  it('does the thing', async () => {
    const { POST } = await import('@/app/api/some/route');
    const { NextRequest } = await import('next/server');

    const res = await POST(
      new NextRequest('http://localhost/api/some', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      })
    );

    expect(res.status).toBe(200);
  });
});
```

## 2) Full HTTP E2E (build + start + fetch)

Use when you must cover HTTP wiring, cookies, middleware, headers, etc.

Key rules:
- Never touch `.next` in tests.
- Use a dedicated dist dir under `.next-e2e/<id>` via `getE2eDistDir()`.
- Pass `NEXT_DIST_DIR` to both `next build` and `next start`.
- Clean up the dist dir and the temp DB in `afterAll`.

Template:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getAvailablePort,
  getE2eDistDir,
  runNextBuild,
  startNextProdServer,
  waitForHttp,
} from '../fixtures/nextE2e';

let baseUrl = '';
let stopServer: (() => Promise<void>) | null = null;
let dbPath = '';
let distDir = '';

describe('My feature (HTTP e2e)', () => {
  beforeAll(async () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    dbPath = path.join(os.tmpdir(), `my-feature-e2e-${ts}.db`);
    process.env.DB_PATH = dbPath;

    distDir = getE2eDistDir(import.meta.url, { name: 'my-feature-http-e2e' });

    // Ensure Next reads the env above.
    vi.resetModules();

    // Keep runs isolated.
    await fs.rm(distDir, { recursive: true, force: true });

    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const env = {
      DB_PATH: dbPath,
      DISABLE_RATE_LIMITS: 'true',
      NEXT_DIST_DIR: distDir,
    };

    await runNextBuild({ env });

    const { stop } = startNextProdServer({ port, env });
    stopServer = stop;

    await waitForHttp(baseUrl, 60_000);
  }, 60_000);

  afterAll(async () => {
    await stopServer?.();
    await fs.rm(distDir, { recursive: true, force: true });
    await fs.rm(dbPath, { force: true });
  });

  it('responds', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
  });
});
```

## Why this exists (Windows + Turbopack safety)

Running tests while `npm run dev` is active can cause Turbopack cache crashes if tests mutate the same dist dir. The project isolates:
- Dev server output: `.next-dev` (via `next.config.ts`)
- HTTP E2E output: `.next-e2e/<id>` (via `NEXT_DIST_DIR`)

This prevents cross-process contention and avoids rewriting tracked files like `tsconfig.json`.
