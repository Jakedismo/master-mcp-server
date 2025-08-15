/*
 * Generates docs/configuration/reference.md from the built-in JSON schema
 * and enriches with examples from examples/sample-configs.
 */
import { SchemaValidator } from '../src/config/schema-validator.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'

type JSONSchema = any

async function main() {
  const schema: JSONSchema | undefined = await SchemaValidator.loadSchema()
  if (!schema) throw new Error('Unable to load configuration schema')

  const examplesDir = path.resolve('examples/sample-configs')
  const exampleFiles = await fs.readdir(examplesDir)
  const exampleSnippets: string[] = []
  for (const f of exampleFiles) {
    if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue
    const content = await fs.readFile(path.join(examplesDir, f), 'utf8')
    exampleSnippets.push(`## Example: ${f}\n\n\u0060\u0060\u0060yaml\n${content}\n\u0060\u0060\u0060\n`)
  }

  const lines: string[] = []
  lines.push('# Configuration Reference')
  lines.push('')
  lines.push('This reference is generated from the built-in JSON Schema used by the server to validate configuration.')
  lines.push('')
  lines.push('## Top-Level Fields')
  lines.push('')
  lines.push(renderObject(schema))
  lines.push('')
  lines.push('## Examples')
  lines.push('')
  lines.push(exampleSnippets.join('\n'))

  const target = path.resolve('docs/configuration/reference.md')
  const contents = await fs.readFile(target, 'utf8').catch(() => '')
  const start = '<!-- GENERATED:BEGIN -->'
  const end = '<!-- GENERATED:END -->'
  const prefix = contents.split(start)[0] ?? ''
  const suffix = contents.split(end)[1] ?? ''
  const generated = `${start}\n\n${lines.join('\n')}\n\n${end}`
  const next = `${prefix}${generated}${suffix}`
  await fs.writeFile(target, next, 'utf8')
}

function renderObject(schema: JSONSchema, indent = 0, name?: string): string {
  const pad = '  '.repeat(indent)
  if (!schema || typeof schema !== 'object') return ''
  let s = ''
  if (schema.type === 'object' || schema.properties) {
    const required = new Set<string>((schema.required || []) as string[])
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const req = required.has(key) ? ' (required)' : ''
      s += `${pad}- \`${name ? name + '.' : ''}${key}\`${req}${renderType(value)}\n`
      if ((value as any).properties || (value as any).items) {
        s += renderObject(value, indent + 1, name ? `${name}.${key}` : key)
      }
    }
  }
  if (schema.items) {
    s += `${pad}  - items:${renderType(schema.items)}\n`
    s += renderObject(schema.items, indent + 2, name ? `${name}[]` : '[]')
  }
  return s
}

function renderType(schema: JSONSchema): string {
  const t = Array.isArray(schema.type) ? schema.type.join('|') : schema.type
  const enumVals = schema.enum ? `, enum: ${schema.enum.join(', ')}` : ''
  const fmt = schema.format ? `, format: ${schema.format}` : ''
  return t ? ` — type: ${t}${enumVals}${fmt}` : `${enumVals}${fmt}`
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

