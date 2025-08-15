<template>
  <div class="mcp-grid" style="margin: 8px 0 16px; align-items: start;">
    <div class="mcp-col-6">
      <h3 style="margin:6px 0">Master Settings</h3>
      <div class="mcp-callout">
        <label>Port
          <input v-model.number="state.port" type="number" min="1" max="65535" style="width:120px;margin-left:8px" />
        </label>
        <br />
        <label style="margin-top:8px;display:block">Base URL
          <input v-model="state.baseUrl" type="text" placeholder="https://your.domain" style="width:100%;margin-top:4px" />
        </label>
        <label style="margin-top:8px;display:block">Client Token (optional)
          <input v-model="state.clientToken" type="text" placeholder="Bearer token for testing" style="width:100%;margin-top:4px" />
        </label>
      </div>

      <h3 style="margin:12px 0 6px">Backends</h3>
      <div v-for="(s, i) in state.servers" :key="i" class="mcp-callout">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label>Id <input v-model="s.id" placeholder="search" /></label>
          <label>Type
            <select v-model="s.type">
              <option>local</option>
              <option>git</option>
              <option>npm</option>
              <option>docker</option>
              <option>pypi</option>
            </select>
          </label>
          <label v-if="s.type==='local'">Port <input v-model.number="s.config.port" type="number" min="1" max="65535" style="width:100px" /></label>
          <label v-else>URL <input v-model="s.config.url" placeholder="http://host:port" /></label>
          <label>Auth
            <select v-model="s.auth_strategy">
              <option>master_oauth</option>
              <option>delegate_oauth</option>
              <option>proxy_oauth</option>
              <option>bypass_auth</option>
            </select>
          </label>
          <button class="mcp-cta" style="margin-left:auto" @click="remove(i)">Remove</button>
        </div>
      </div>
      <button class="mcp-cta" @click="add">Add Backend</button>
    </div>

    <div class="mcp-col-6">
      <h3 style="margin:6px 0">Generated config.yaml</h3>
      <div style="position:relative">
        <button class="mcp-cta" style="position:absolute;right:8px;top:8px" @click="copyText(yaml)">Copy</button>
        <pre><code class="language-yaml">{{ yaml }}</code></pre>
      </div>

      <h3 style="margin:12px 0 6px">config.json</h3>
      <div style="position:relative">
        <button class="mcp-cta" style="position:absolute;right:8px;top:8px" @click="copyText(json)">Copy</button>
        <pre><code class="language-json">{{ json }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'

type Server = {
  id: string
  type: 'local' | 'git' | 'npm' | 'docker' | 'pypi'
  auth_strategy: 'master_oauth' | 'delegate_oauth' | 'proxy_oauth' | 'bypass_auth'
  config: { port?: number; url?: string }
}

const state = reactive({
  port: 3000,
  baseUrl: '',
  clientToken: '',
  servers: [
    { id: 'search', type: 'local', auth_strategy: 'master_oauth', config: { port: 4100 } } as Server,
  ],
})

function add() {
  state.servers.push({ id: '', type: 'local', auth_strategy: 'master_oauth', config: {} })
}
function remove(i: number) {
  state.servers.splice(i, 1)
}

const jsonObj = computed(() => ({
  hosting: {
    port: state.port,
    base_url: state.baseUrl || undefined,
  },
  servers: state.servers.map(s => ({
    id: s.id, type: s.type, auth_strategy: s.auth_strategy, config: s.config,
  })),
}))

const json = computed(() => JSON.stringify(jsonObj.value, null, 2))

function toYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return obj.map(v => `${pad}- ${typeof v === 'object' ? `\n${toYaml(v, indent + 1)}` : toYaml(v, indent)}`).join('\n')
  }
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (v && typeof v === 'object') {
        const nested = toYaml(v, indent + 1)
        return `${pad}${k}:\n${nested}`
      }
      return `${pad}${k}: ${toYaml(v, 0)}`
    })
    .join('\n')
}

const yaml = computed(() => toYaml({
  hosting: { port: state.port, base_url: state.baseUrl || undefined },
  servers: jsonObj.value.servers,
}))

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    console.warn('Copy failed', e)
  }
}
</script>

