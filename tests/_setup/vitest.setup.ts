// Global test setup for Node-targeted suites
import { Logger } from '../../src/utils/logger.js'

// Reduce log noise; allow tests to opt into capture
Logger.configure({ level: 'error', json: true })

// Node 18 has global fetch; ensure it exists for all tests
if (typeof fetch !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFetch = require('node-fetch')
  // @ts-ignore
  globalThis.fetch = nodeFetch
}

