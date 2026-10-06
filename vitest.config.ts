import { defineConfig } from 'vitest/config';

// Plain Node tests for the CLI (the root config runs the Worker pool).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
