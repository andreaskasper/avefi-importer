<script setup lang="ts">
/** Verarbeitungsstand als Abzeichen. Farbe aus app.css, Text aus i18n. */
import { STATUS_BADGE } from './types'

const props = defineProps<{ status: string }>()
const { t, te } = useI18n()

const cls = computed(() => STATUS_BADGE[props.status] ?? 'b-neutral')
const label = computed(() => {
  const key = `imports.status.${props.status}`
  return te(key) ? t(key) : t('imports.status.unknown')
})
</script>

<template>
  <span class="badge" :class="cls"><span class="bd" aria-hidden="true" />{{ label }}</span>
</template>
