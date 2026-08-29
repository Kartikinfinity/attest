import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/web/lib/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    // Integration tests that start servers need longer timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
