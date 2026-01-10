import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Several suites spin up a Next.js dev server. Running test files in parallel
    // causes contention on the shared .next directory (especially on Windows),
    // which can make server startup hang and hooks time out.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
