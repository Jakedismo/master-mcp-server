<template>
  <div class="mcp-tabs" role="tablist" aria-label="Code Tabs">
    <div class="mcp-tabs__nav">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="mcp-tabs__btn"
        role="tab"
        :aria-selected="active === opt.value"
        @click="active = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>
    <div class="mcp-tabs__panel" role="tabpanel">
      <slot :name="active" />
    </div>
  </div>
  <div v-if="note" class="mcp-callout" style="margin-top:8px">{{ note }}</div>
  <div v-if="footnote" style="margin-top:6px;color:var(--vp-c-text-2);font-size:.9rem">{{ footnote }}</div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'

interface Option { label: string; value: string }
const props = defineProps<{
  options: Option[]
  modelValue?: string
  note?: string
  footnote?: string
}>()
const active = ref(props.modelValue || (props.options[0]?.value ?? ''))
watchEffect(() => {
  if (!props.options.find(o => o.value === active.value)) {
    active.value = props.options[0]?.value ?? ''
  }
})
</script>

