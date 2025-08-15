<template>
  <div class="mcp-callout" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <label>Endpoint
      <select v-model="endpoint" style="margin-left:8px">
        <option value="tools.list">POST /mcp/tools/list</option>
        <option value="tools.call">POST /mcp/tools/call</option>
        <option value="resources.list">POST /mcp/resources/list</option>
        <option value="resources.read">POST /mcp/resources/read</option>
      </select>
    </label>
    <label>Base URL <input v-model="baseUrl" placeholder="http://localhost:3000" /></label>
    <label>Token <input v-model="token" placeholder="optional bearer" /></label>
  </div>

  <div class="mcp-grid">
    <div class="mcp-col-6">
      <h4>Request Body</h4>
      <textarea v-model="body" rows="10" style="width:100%;font-family:var(--vp-font-family-mono)"></textarea>
    </div>
    <div class="mcp-col-6">
      <h4>curl</h4>
      <pre><code>{{ curl }}</code></pre>
      <h4 style="margin-top:10px">Node (fetch)</h4>
      <pre><code class="language-ts">{{ node }}</code></pre>
    </div>
  </div>
  <p style="color:var(--vp-c-text-2);font-size:.9rem;margin-top:6px">Note: This playground does not perform live requests in the docs site; copy commands to run locally.</p>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const endpoint = ref<'tools.list'|'tools.call'|'resources.list'|'resources.read'>('tools.list')
const baseUrl = ref('http://localhost:3000')
const token = ref('')
const body = ref('')

const defaultBodies: Record<string, string> = {
  'tools.list': JSON.stringify({ type: 'list_tools' }, null, 2),
  'tools.call': JSON.stringify({ name: 'serverId.toolName', arguments: { query: 'hello' } }, null, 2),
  'resources.list': JSON.stringify({ type: 'list_resources' }, null, 2),
  'resources.read': JSON.stringify({ uri: 'serverId:resourceId' }, null, 2)
}

watch(endpoint, (v) => { body.value = defaultBodies[v] })
body.value = defaultBodies[endpoint.value]

const path = computed(() => {
  switch (endpoint.value) {
    case 'tools.list': return '/mcp/tools/list'
    case 'tools.call': return '/mcp/tools/call'
    case 'resources.list': return '/mcp/resources/list'
    case 'resources.read': return '/mcp/resources/read'
  }
})

const curl = computed(() => {
  const headers = ["-H 'content-type: application/json'"]
  if (token.value) headers.push(`-H 'authorization: Bearer ${token.value}'`)
  return `curl -s ${headers.join(' ')} -X POST ${baseUrl.value}${path.value} -d '${body.value.replace(/'/g, "'\\''")}'`
})

const node = computed(() => `import fetch from 'node-fetch'

const res = await fetch('${baseUrl.value}${path.value}', {
  method: 'POST',
  headers: {
    'content-type': 'application/json'${token.value ? ",\n    authorization: 'Bearer " + token.value + "'" : ''}
  },
  body: JSON.stringify(${body.value})
})
const data = await res.json()
console.log(data)
`)
</script>

