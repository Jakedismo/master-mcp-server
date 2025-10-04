import { test } from 'node:test'
import assert from 'node:assert'
import { StdioCapabilityDiscovery } from '../../../src/modules/stdio-capability-discovery.js'
import { StdioManager } from '../../../src/modules/stdio-manager.js'

test('StdioCapabilityDiscovery should instantiate correctly', async () => {
  const manager = new StdioManager()
  const discovery = new StdioCapabilityDiscovery(manager)
  assert.ok(discovery)
})

test('StdioCapabilityDiscovery should have required methods', async () => {
  const manager = new StdioManager()
  const discovery = new StdioCapabilityDiscovery(manager)
  assert.strictEqual(typeof discovery.discoverCapabilities, 'function')
  assert.strictEqual(typeof discovery.callTool, 'function')
  assert.strictEqual(typeof discovery.readResource, 'function')
})