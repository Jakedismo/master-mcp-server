import express from 'express'
import { createServer } from '../index.js'

export async function startNode() {
  const app = express()
  await createServer()
  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Master MCP (Node) on ${port}`)
  })
}

