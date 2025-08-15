import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { SecretManager } from '../../src/config/secret-manager.js'

test('SecretManager encrypt/decrypt and resolve env placeholders', () => {
  const sm = new SecretManager({ key: 'k123' })
  const enc = sm.encrypt('s3cr3t')
  assert.ok(sm.isEncrypted(enc))
  assert.equal(sm.decrypt(enc), 's3cr3t')

  process.env.MY_TOKEN = 'abc'
  const cfg = { a: enc, b: 'env:MY_TOKEN', c: { password: 'x' } }
  const resolved = sm.resolveSecrets(cfg)
  assert.equal(resolved.a, 's3cr3t')
  assert.equal(resolved.b, 'abc')
  const redacted = sm.redact(resolved)
  assert.equal(redacted.c.password, '***')
})

