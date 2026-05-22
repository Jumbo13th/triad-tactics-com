const requiredInProduction = [
  'STEAM_WEB_API_KEY',
  'ADMIN_STEAM_IDS',
  // Ensures stable Server Action encryption keys across deploys/instances.
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
  // Required for Brevo transactional emails
  'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL',
  'BREVO_SENDER_NAME',
  // Encrypts persisted Discord OAuth tokens at rest.
  'DISCORD_TOKEN_ENCRYPTION_KEY',
  // Protects cron-triggered outbox endpoint
  'OUTBOX_CRON_SECRET',
  // Protects game server player lookup API
  'GAMESERVER_API_SECRET',
  // Discord application client ID
  'DISCORD_CLIENT_ID',
  // Discord application client secret
  'DISCORD_CLIENT_SECRET',
  // Discord application bot token
  'DISCORD_BOT_TOKEN',
  // URI for Discord to redirect on, during auth process
  'DISCORD_REDIRECT_URI',
  // Server ID
  'DISCORD_GUILD_ID',
  // Confirmed role ID
  'DISCORD_CONFIRMED_ROLE_ID',
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
