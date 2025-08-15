import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CryptoUtils } from '../../src/utils/crypto.js'

test('CryptoUtils encrypt/decrypt roundtrip', () => {
  const key = 'super-secret-key'
  const text = 'hello world ' + Date.now()
  const enc = CryptoUtils.encrypt(text, key)
  assert.ok(typeof enc === 'string' && enc.length > 16)
  const dec = CryptoUtils.decrypt(enc, key)
  assert.equal(dec, text)
})

test('CryptoUtils hash/verify', () => {
  const h = CryptoUtils.hash('abc')
  assert.ok(h.length === 64)
  assert.ok(CryptoUtils.verify('abc', h))
  assert.equal(CryptoUtils.verify('abcd', h), false)
})

test('CryptoUtils pbkdf2 and scrypt hashing', () => {
  const p = 'password'
  const pb = CryptoUtils.pbkdf2Hash(p, 10_000, 8)
  assert.ok(pb.startsWith('pbkdf2$sha256$'))
  assert.ok(CryptoUtils.pbkdf2Verify(p, pb))
  assert.equal(CryptoUtils.pbkdf2Verify('nope', pb), false)

  const sc = CryptoUtils.scryptHash(p, { N: 1024, r: 8, p: 1, saltLen: 8, keyLen: 16 })
  assert.ok(sc.startsWith('scrypt$'))
  assert.ok(CryptoUtils.scryptVerify(p, sc))
  assert.equal(CryptoUtils.scryptVerify('nope', sc), false)
})

test('CryptoUtils bcryptHash falls back but verifies', async () => {
  const p = 'topsecret'
  const h = await CryptoUtils.bcryptHash(p)
  assert.ok(typeof h === 'string')
  assert.ok(await CryptoUtils.bcryptVerify(p, h))
  assert.equal(await CryptoUtils.bcryptVerify('nope', h), false)
})

