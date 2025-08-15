import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['tests/workers/**/*', 'dist', 'node_modules'],
    setupFiles: ['tests/_setup/vitest.setup.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov', 'cobertura'],
      provider: 'v8',
      reportsDirectory: './coverage/node',
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/runtime/worker.ts', 'src/types/**', 'src/**/index.ts'],
      thresholds: {
        lines: 0.85,
        functions: 0.85,
        branches: 0.8,
        statements: 0.85,
      },
    },
  },
})

