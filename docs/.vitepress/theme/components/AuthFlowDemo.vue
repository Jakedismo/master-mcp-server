<template>
  <div class="mcp-callout">
    <label>Strategy
      <select v-model="strategy" style="margin-left:8px">
        <option value="master_oauth">master_oauth</option>
        <option value="delegate_oauth">delegate_oauth</option>
        <option value="proxy_oauth">proxy_oauth</option>
        <option value="bypass_auth">bypass_auth</option>
      </select>
    </label>
  </div>

  <div class="mcp-grid" style="align-items:start">
    <div class="mcp-col-6">
      <h4 style="margin:8px 0">Flow</h4>
      <ul>
        <li v-for="(s, i) in flow.steps" :key="i">{{ s }}</li>
      </ul>
      <div class="mcp-callout" v-if="flow.note">{{ flow.note }}</div>
    </div>
    <div class="mcp-col-6">
      <h4 style="margin:8px 0">Diagram</h4>
      <div class="mcp-diagram">
        <svg viewBox="0 0 600 240" width="100%" height="180">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
            </marker>
          </defs>
          <!-- Nodes -->
          <rect x="30" y="30" width="140" height="40" rx="8" fill="none" stroke="currentColor" />
          <text x="100" y="55" text-anchor="middle">Client</text>
          <rect x="230" y="30" width="140" height="40" rx="8" fill="none" stroke="currentColor" />
          <text x="300" y="55" text-anchor="middle">Master</text>
          <rect x="430" y="30" width="140" height="40" rx="8" fill="none" stroke="currentColor" />
          <text x="500" y="55" text-anchor="middle">Backend</text>

          <!-- Arrows vary by strategy -->
          <g v-if="strategy==='master_oauth'">
            <path d="M170,50 L230,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="200" y="40" text-anchor="middle">Bearer client_token</text>
            <path d="M370,50 L430,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="400" y="40" text-anchor="middle">Bearer client_token</text>
          </g>
          <g v-else-if="strategy==='delegate_oauth'">
            <path d="M170,50 L230,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="200" y="40" text-anchor="middle">call tool</text>
            <path d="M230,90 L120,160" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="170" y="130" text-anchor="middle">302 authorize</text>
            <path d="M120,160 L430,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="275" y="120" text-anchor="middle">code + PKCE</text>
            <path d="M430,50 L230,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="330" y="40" text-anchor="middle">token stored</text>
          </g>
          <g v-else-if="strategy==='proxy_oauth'">
            <path d="M170,50 L230,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="200" y="40" text-anchor="middle">call tool</text>
            <path d="M370,50 L430,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="400" y="40" text-anchor="middle">Bearer backend_token</text>
            <path d="M300,70 L300,120 L430,120" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="360" y="110" text-anchor="middle">refresh if needed</text>
          </g>
          <g v-else>
            <path d="M170,50 L230,50" stroke="currentColor" marker-end="url(#arrow)" />
            <path d="M370,50 L430,50" stroke="currentColor" marker-end="url(#arrow)" />
            <text x="400" y="40" text-anchor="middle">no auth header</text>
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const strategy = ref<'master_oauth'|'delegate_oauth'|'proxy_oauth'|'bypass_auth'>('master_oauth')

const flow = computed(() => {
  switch (strategy.value) {
    case 'master_oauth':
      return {
        steps: [
          'Client calls master with Authorization: Bearer <client_token>',
          'Master forwards same token to backend',
          'Backend validates token and serves the request'
        ],
        note: 'Simple and effective when backends trust the same issuer/audience as the client.'
      }
    case 'delegate_oauth':
      return {
        steps: [
          'Client calls master; master requires backend auth',
          'Master responds with OAuth delegation metadata',
          'Client completes provider auth via /oauth/authorize and callback',
          'Master stores backend token and retries the call'
        ],
        note: 'Use PKCE + state. Configure provider endpoints and client credentials.'
      }
    case 'proxy_oauth':
      return {
        steps: [
          'Master manages backend tokens and refresh cycles',
          'Requests include backend token; refresh on expiry',
          'Fallback to delegation or pass-through as configured'
        ],
        note: 'Centralizes token lifecycle with fewer client prompts.'
      }
    default:
      return {
        steps: [
          'No authentication is added by master',
          'Backend must not require Authorization for selected endpoints'
        ],
        note: 'Use only for public or development backends.'
      }
  }
})
</script>

