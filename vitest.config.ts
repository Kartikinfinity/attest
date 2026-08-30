import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'packages/**/src/**/*.test.ts',
      // Covers both apps/web/lib/ (server-side: engine, models,
      // failure-classification) and apps/web/src/lib/ (client-side:
      // status/display helpers).
      'apps/web/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    // Integration tests that start servers need longer timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
