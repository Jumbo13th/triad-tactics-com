import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Run only against the isolated CI container with its disposable database.
assert.notEqual(process.getuid(), 0, 'The production container must run as non-root.');
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const memory = new Database(':memory:');
memory.exec('CREATE TABLE smoke (value INTEGER); INSERT INTO smoke VALUES (42)');
assert.equal(memory.prepare('SELECT value FROM smoke').get().value, 42);
memory.close();

const origin = 'http://127.0.0.1:3000';
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${origin}/en`, { signal: AbortSignal.timeout(3000) });
    await response.arrayBuffer();
    if (response.status === 200) {
      ready = true;
      break;
    }
  } catch {
    // The application may still be starting.
  }
  await delay(1000);
}
assert.ok(ready, 'Production HTTP server did not become ready.');

const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10000) });
assert.equal(health.status, 200, '/api/health must pass in the production image.');
assert.equal(health.headers.get('cache-control'), 'no-store');
console.log('Production smoke check passed: /api/health');

for (const path of ['/en', '/ru', '/api/games/current', '/api/units']) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${path} must respond successfully.`);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', `${path} must send security headers.`);
  assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=/);
  if (path.startsWith('/api/')) {
    const body = await response.json();
    if (path === '/api/games/current') assert.equal(body.success, true);
    if (path === '/api/units') assert.ok(Array.isArray(body.units));
  } else {
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    const asset = html.match(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))(?:\?[^\"]*)?"/);
    assert.ok(asset, `${path} must reference compiled static assets.`);
    const assetResponse = await fetch(`${origin}${asset[1]}`, { signal: AbortSignal.timeout(10000) });
    assert.equal(assetResponse.status, 200, 'Compiled static assets must be served.');
    assert.ok((await assetResponse.arrayBuffer()).byteLength > 0);
  }
  console.log(`Production smoke check passed: ${path}`);
}

const db = new Database('/app/database/applications.db', { readonly: true, fileMustExist: true });
assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
assert.ok(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count > 0,
  'The application must create and migrate its database.');
db.close();
console.log('Non-root SQLite native module, migrations and integrity checks passed.');
