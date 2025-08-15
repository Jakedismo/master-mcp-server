import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { SchemaValidator } from '../../src/config/schema-validator.js'

test('SchemaValidator accepts minimal valid config', async () => {
  const schema = await SchemaValidator.loadSchema('config/schema.json')
  const cfg = {
    master_oauth: {
      authorization_endpoint: 'https://auth.local/authorize',
      token_endpoint: 'https://auth.local/token',
      client_id: 'x',
      redirect_uri: 'http://localhost/cb',
      scopes: ['openid'],
    },
    hosting: { platform: 'node' },
    servers: [],
  }
  assert.doesNotThrow(() => SchemaValidator.assertValid(cfg, schema!))
})

test('SchemaValidator rejects invalid platform', async () => {
  const schema = await SchemaValidator.loadSchema('config/schema.json')
  const cfg: any = {
    master_oauth: {
      authorization_endpoint: 'https://auth.local/authorize',
      token_endpoint: 'https://auth.local/token',
      client_id: 'x',
      redirect_uri: 'http://localhost/cb',
      scopes: ['openid'],
    },
    hosting: { platform: 'nope' },
    servers: [],
  }
  assert.throws(() => SchemaValidator.assertValid(cfg, schema!))
})

