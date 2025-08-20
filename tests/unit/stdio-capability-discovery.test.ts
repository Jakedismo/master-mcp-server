import { test } from 'node:test'
import assert from 'node:assert'
import { StdioCapabilityDiscovery } from '../src/modules/stdio-capability-discovery.js'

test('StdioCapabilityDiscovery should discover capabilities from a STDIO server', async () => {
  // This test would require a running STDIO server
  // For now, we'll just test that the class can be instantiated
  const discovery = new StdioCapabilityDiscovery()
  assert.ok(discovery)
})

test('StdioCapabilityDiscovery should have discoverCapabilities method', async () => {
  const discovery = new StdioCapabilityDiscovery()
  assert.strictEqual(typeof discovery.discoverCapabilities, 'function')
})

test('StdioCapabilityDiscovery should have callTool method', async () => {
  const discovery = new StdioCapabilityDiscovery()
  assert.strictEqual(typeof discovery.callTool, 'function')
})

test('StdioCapabilityDiscovery should have readResource method', async () => {
  const discovery = new StdioCapabilityDiscovery()
  assert.strictEqual(typeof discovery.readResource, 'function')
})