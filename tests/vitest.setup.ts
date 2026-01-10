import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load local env files for `vitest run`.
// - `override: false` ensures CI / shell-provided env vars win.
// - These files are gitignored via `.gitignore` (`.env*`).
const envFileCandidates = ['.env.test.local', '.env.local', '.env.test', '.env'];

for (const filename of envFileCandidates) {
  const envFilePath = path.join(process.cwd(), filename);
  if (fs.existsSync(envFilePath)) {
    loadEnv({ path: envFilePath, override: false });
  }
}
