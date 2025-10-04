import { test } from 'node:test'
import assert from 'node:assert'
import { StdioManager } from '../../../src/modules/stdio-manager.js'
import path from 'node:path'

test('StdioManager should handle notifications', async () => {
  const manager = new StdioManager()
  const serverId = 'test-server'
  const serverPath = path.resolve(process.cwd(), 'tests/fixtures/stdio-server.js')

  let notificationReceived = null
  const notificationPromise = new Promise(resolve => {
    manager.onNotification(serverId, (message) => {
      notificationReceived = message
      resolve(message)
    })
  })

  await manager.startServer(serverId, serverPath)

  // Give the server a moment to start and send a notification
  await new Promise(resolve => setTimeout(resolve, 500))

  // The test server should send a notification on start
  // Let's wait for it
  await notificationPromise

  assert.deepStrictEqual(notificationReceived, { type: 'notification', message: 'server ready' })

  const server = manager['processes'].get(serverId)
  server?.kill()
})