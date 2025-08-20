import { MultiAuthManager } from '../../src/auth/multi-auth-manager.js'
import { AuthStrategy } from '../../src/types/config.js'
import '../setup/test-setup.js'

const masterCfg = {
  authorization_endpoint: 'http://localhost/auth',
  token_endpoint: 'http://localhost/token',
  client_id: 'master',
  redirect_uri: 'http://localhost/cb',
  scopes: ['openid'],
}

async function testAuth() {
  console.log('Testing MultiAuthManager...')
  
  try {
    const mam = new MultiAuthManager(masterCfg)
    mam.registerServerAuth('srv1', AuthStrategy.MASTER_OAUTH)
    const h = await mam.prepareAuthForBackend('srv1', 'CLIENT')
    
    if (h.Authorization === 'Bearer CLIENT') {
      console.log('✅ Test 1 passed: Master OAuth pass-through')
    } else {
      console.log('❌ Test 1 failed:', h)
    }

    // Test delegation
    mam.registerServerAuth('srv2', AuthStrategy.DELEGATE_OAUTH, {
      provider: 'custom', 
      authorization_endpoint: 'http://p/auth', 
      token_endpoint: 'http://p/token', 
      client_id: 'c'
    })
    const d = await mam.prepareAuthForBackend('srv2', 'CLIENT')
    
    if (d.type === 'oauth_delegation') {
      console.log('✅ Test 2 passed: OAuth delegation')
    } else {
      console.log('❌ Test 2 failed:', d)
    }

    // Test storage
    await mam.storeDelegatedToken('CLIENT', 'srv', { access_token: 'S', expires_at: Date.now() + 1000, scope: [] })
    const tok = await mam.getStoredServerToken('srv', 'CLIENT')
    
    if (tok === 'S') {
      console.log('✅ Test 3 passed: Token storage')
    } else {
      console.log('❌ Test 3 failed:', tok)
    }
    
    console.log('All tests completed successfully!')
    
  } catch (error) {
    console.error('Test failed:', error)
    console.error('Stack:', error.stack)
  }
}

testAuth()