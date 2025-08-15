// Global test setup for Node test runner with ts-node ESM
// - Configures logger to reduce noise
// - Provides minimal polyfills and deterministic behavior where helpful

import { Logger } from '../../src/utils/logger.js'

// Quiet logs during tests unless DEBUG is set
Logger.configure({ level: (process.env.DEBUG ? 'debug' : 'error') as any, json: false })

// Ensure process.env defaults for tests
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

// Deterministic Math.random for some tests (can be overridden locally)
const seed = 42
let state = seed
const origRandom = Math.random
globalThis.Math.random = () => {
  if (process.env.TEST_NON_DETERMINISTIC === '1') return origRandom()
  state = (1103515245 * state + 12345) % 0x100000000
  return state / 0x100000000
}

// Export nothing; imported by tests as side-effect
export {}

