import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Real-network SMTP setup (Ethereal account creation + send) needs more
    // headroom than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Print Ethereal credentials and any [notify] log lines.
    silent: false,
    include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
