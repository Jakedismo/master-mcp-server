import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import CodeTabs from './components/CodeTabs.vue'
import ConfigGenerator from './components/ConfigGenerator.vue'
import AuthFlowDemo from './components/AuthFlowDemo.vue'
import ApiPlayground from './components/ApiPlayground.vue'
import './style.css'

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('CodeTabs', CodeTabs)
    app.component('ConfigGenerator', ConfigGenerator)
    app.component('AuthFlowDemo', AuthFlowDemo)
    app.component('ApiPlayground', ApiPlayground)
  },
}

export default theme

