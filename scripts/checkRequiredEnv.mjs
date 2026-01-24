const requiredInProduction = [
  'STEAM_WEB_API_KEY',
  'ADMIN_STEAM_IDS',
  // Ensures stable Server Action encryption keys across deploys/instances.
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
  // Required for Brevo transactional emails
  'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL',
  'BREVO_SENDER_NAME',
  // Protects cron-triggered outbox endpoint
  'OUTBOX_CRON_SECRET'
];

if (process.env.NODE_ENV !== 'production') {
  process.exit(0);
}

const missing = requiredInProduction.filter((name) => {
  const value = process.env[name];
  return !value || String(value).trim() === '';
});

if (missing.length > 0) {
  // Keep message stable and actionable.
  throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
}
