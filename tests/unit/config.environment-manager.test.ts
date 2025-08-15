import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { EnvironmentManager } from '../../src/config/environment-manager.js'

test('EnvironmentManager parseCliArgs dotted keys', () => {
  const orig = process.argv
  process.argv = ['node', 'script', '--hosting.port=4001', '--logging.level=debug', '--config-path=./x.json']
  try {
    const parsed = EnvironmentManager.parseCliArgs()
    assert.equal((parsed as any).hosting.port, 4001)
    assert.equal((parsed as any).logging.level, 'debug')
    assert.equal((parsed as any).configPath, './x.json')
  } finally {
    process.argv = orig
  }
})

test('EnvironmentManager loadEnvOverrides maps vars', () => {
  process.env.MASTER_HOSTING_PORT = '1234'
  process.env.MASTER_OAUTH_SCOPES = 'a,b'
  const ov = EnvironmentManager.loadEnvOverrides()
  // @ts-ignore
  assert.equal(ov.hosting?.port, 1234)
  // @ts-ignore
  assert.deepEqual(ov.master_oauth?.scopes, ['a','b'])
})

