import { MultiAuthManager } from '../../src/auth/multi-auth-manager.js'
import { AuthStrategy } from '../../src/types/config.js'

const masterCfg = {
  authorization_endpoint: 'http://localhost/auth',
  token_endpoint: 'http://localhost/token',
  client_id: 'master',
  redirect_uri: 'http://localhost/cb',
  scopes: ['openid'],
}

try {
  console.log('Creating MultiAuthManager...')
  const mam = new MultiAuthManager(masterCfg)
  console.log('MultiAuthManager created successfully')
  
  console.log('Registering server auth...')
  mam.registerServerAuth('srv1', AuthStrategy.MASTER_OAUTH)
  console.log('Server auth registered')
  
  console.log('Preparing auth for backend...')
  const h = await mam.prepareAuthForBackend('srv1', 'CLIENT')
  console.log('Result:', h)
  
} catch (error) {
  console.error('Error:', error)
  console.error('Stack:', error.stack)
}