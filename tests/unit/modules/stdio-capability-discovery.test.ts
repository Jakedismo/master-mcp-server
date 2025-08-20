import { test } from 'node:test'
import assert from 'node:assert'
import { StdioCapabilityDiscovery } from '../../src/modules/stdio-capability-discovery.js'

test('StdioCapabilityDiscovery should instantiate correctly', async () => {
  const discovery = new StdioCapabilityDiscovery()
  assert.ok(discovery)
})

test('StdioCapabilityDiscovery should have required methods', async () => {
  const discovery = new StdioCapabilityDiscovery()
  assert.strictEqual(typeof discovery.discoverCapabilities, 'function')
  assert.strictEqual(typeof discovery.callTool, 'function')
  assert.strictEqual(typeof discovery.readResource, 'function')
})