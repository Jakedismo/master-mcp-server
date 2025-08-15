// Miniflare/Vitest setup for Workers-targeted suites
import { Logger } from '../../src/utils/logger.js'

Logger.configure({ level: 'error', json: true })

// Miniflare provides global fetch/Request/Response.
// If we need to start auxiliary Node HTTP stubs, do it within tests.

