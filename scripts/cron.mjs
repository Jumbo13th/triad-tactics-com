import { setTimeout as delay } from 'node:timers/promises';

// Kamal names app containers per version; the web role's network alias is the stable target.
const url = process.env.CRON_URL || 'http://triad-tactics-web:3000/api/cron';
const intervalMs = Number(process.env.CRON_INTERVAL_SECONDS || 60) * 1000;
const secret = process.env.OUTBOX_CRON_SECRET?.trim();

if (!secret) {
  throw new Error('OUTBOX_CRON_SECRET is required');
}

// Node as PID 1 ignores SIGTERM unless handled, which stalls every deploy.
process.on('SIGTERM', () => process.exit(0));

// Sequential on purpose: a slow run must delay the next one, not overlap it.
for (;;) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000)
    });
    await response.arrayBuffer();
    if (!response.ok) console.error(`Cron request failed: HTTP ${response.status}`);
  } catch (error) {
    console.error(`Cron request failed: ${error.message}`);
  }
  await delay(intervalMs);
}
