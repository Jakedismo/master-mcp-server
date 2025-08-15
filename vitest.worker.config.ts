import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/workers/**/*.{test,spec}.ts'],
    setupFiles: ['tests/_setup/miniflare.setup.ts'],
    environment: 'miniflare',
    environmentOptions: {
      modules: true,
      script: undefined, // tests import modules directly
      bindings: {},
      kvNamespaces: [],
      durableObjects: {},
    },
    coverage: {
      reporter: ['text', 'lcov'],
      provider: 'v8',
      reportsDirectory: './coverage/workers',
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/runtime/node.ts', 'src/types/**'],
      thresholds: {
        lines: 0.8,
        functions: 0.8,
        branches: 0.75,
        statements: 0.8,
      },
    },
  },
})

