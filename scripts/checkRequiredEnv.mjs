const requiredInProduction = ['ADMIN_PASSWORD', 'STEAM_WEB_API_KEY'];

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
