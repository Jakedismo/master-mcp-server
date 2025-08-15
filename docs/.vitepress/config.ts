import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Master MCP Server',
  description: 'Aggregate and orchestrate multiple MCP servers behind one endpoint',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['meta', { name: 'theme-color', content: '#0ea5e9' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Master MCP Server',
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-org/master-mcp-server' }
    ],
    outline: [2, 6],
    nav: [
      { text: 'Getting Started', link: '/getting-started/overview' },
      { text: 'Guides', link: '/guides/index' },
      { text: 'API', link: '/api/index' },
      { text: 'Configuration', link: '/configuration/overview' },
      { text: 'Deployment', link: '/deployment/index' },
      { text: 'Examples', link: '/examples/index' },
      { text: 'Advanced', link: '/advanced/index' },
      { text: 'Troubleshooting', link: '/troubleshooting/index' },
      { text: 'Contributing', link: '/contributing/index' }
    ],
    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/getting-started/overview' },
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Quick Start', link: '/getting-started/quick-start' },
            { text: 'Quickstart (Node)', link: '/getting-started/quickstart-node' },
            { text: 'Quickstart (Workers)', link: '/getting-started/quickstart-workers' },
            { text: 'Core Concepts', link: '/getting-started/concepts' }
          ]
        }
      ],
      '/guides/': [
        {
          text: 'User Guides',
          items: [
            { text: 'Authentication', link: '/guides/authentication' },
            { text: 'OAuth Delegation', link: '/guides/oauth-delegation' },
            { text: 'Client Integration', link: '/guides/client-integration' },
            { text: 'Server Sharing', link: '/guides/server-sharing' },
            { text: 'Module Loading', link: '/guides/module-loading' },
            { text: 'Request Routing', link: '/guides/request-routing' },
            { text: 'Configuration', link: '/guides/configuration' },
            { text: 'Testing Strategy', link: '/guides/testing' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/index' },
            { text: 'Types', link: '/api/reference/modules' }
          ]
        }
      ],
      '/configuration/': [
        {
          text: 'Configuration',
          items: [
            { text: 'Overview', link: '/configuration/overview' },
            { text: 'Reference', link: '/configuration/reference' },
            { text: 'Examples', link: '/configuration/examples' },
            { text: 'Environment Variables', link: '/configuration/environment' }
          ]
        }
      ],
      '/deployment/': [
        {
          text: 'Deployment',
          items: [
            { text: 'Overview', link: '/deployment/index' },
            { text: 'Docker', link: '/deployment/docker' },
            { text: 'Cloudflare Workers', link: '/deployment/cloudflare-workers' },
            { text: 'Koyeb', link: '/deployment/koyeb' },
            { text: 'Docs Site', link: '/deployment/docs-site' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Index', link: '/examples/index' },
            { text: 'Basic Node Aggregator', link: '/examples/basic-node' },
            { text: 'Cloudflare Worker', link: '/examples/cloudflare-worker' },
            { text: 'Advanced Routing', link: '/examples/advanced-routing' },
            { text: 'OAuth Delegation', link: '/examples/oauth-delegation' },
            { text: 'Testing Patterns', link: '/examples/testing' }
          ]
        }
      ],
      '/advanced/': [
        {
          text: 'Advanced Topics',
          items: [
            { text: 'Security Hardening', link: '/advanced/security' },
            { text: 'Performance & Scalability', link: '/advanced/performance' },
            { text: 'Monitoring & Logging', link: '/advanced/monitoring' },
            { text: 'Extensibility & Plugins', link: '/advanced/extensibility' }
          ]
        }
      ],
      '/troubleshooting/': [
        {
          text: 'Troubleshooting',
          items: [
            { text: 'Common Issues', link: '/troubleshooting/index' },
            { text: 'OAuth & Tokens', link: '/troubleshooting/oauth' },
            { text: 'Routing & Modules', link: '/troubleshooting/routing' },
            { text: 'Deployment', link: '/troubleshooting/deployment' }
          ]
        }
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Overview', link: '/contributing/index' },
            { text: 'Development Setup', link: '/contributing/dev-setup' },
            { text: 'Coding & Docs Guidelines', link: '/contributing/guidelines' }
          ]
        }
      ]
    }
  }
})
