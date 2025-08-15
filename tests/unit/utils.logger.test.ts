import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Logger } from '../../src/utils/logger.js'

test('Logger emits human log line', () => {
  const lines: string[] = []
  const orig = console.log
  console.log = (s: any) => { lines.push(String(s)) }
  try {
    Logger.configure({ json: false, level: 'debug' })
    Logger.info('hello', { a: 1 })
    assert.ok(lines.length >= 1)
    assert.match(lines[0], /\[INFO\].*hello/)
  } finally {
    console.log = orig
    Logger.configure({ json: false, level: 'error' })
  }
})

test('Logger child with base fields', () => {
  const lines: string[] = []
  const orig = console.log
  console.log = (s: any) => { lines.push(String(s)) }
  try {
    Logger.configure({ json: true, level: 'debug', base: { svc: 'x' } })
    const L = Logger.with({ reqId: 'r1' })
    L.debug('dbg', { extra: 2 })
    assert.ok(lines.length)
    const parsed = JSON.parse(lines[0])
    assert.equal(parsed.svc, 'x')
    assert.equal(parsed.reqId, 'r1')
    assert.equal(parsed.msg, 'dbg')
  } finally {
    console.log = orig
  }
})

