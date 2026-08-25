<script setup lang="ts">
/**
 * Ein Zeitpunkt in der Zeitzone des Betrachters.
 *
 * Der Server kennt die Zeitzone des Browsers nicht; er rechnet in der des
 * Containers (UTC). Wird beides gemischt, steht beim Aufbau der Seite eine
 * andere Uhrzeit da als nach dem Laden — Vue meldet dann einen
 * Hydrationsfehler, und der Mensch sieht kurz die falsche Zeit.
 *
 * Deshalb zwei Schritte: beim Aufbau UTC, im Browser Ortszeit. Der erste
 * Durchgang im Browser rechnet noch in UTC, damit er zum gelieferten Aufbau
 * passt; erst danach wird umgestellt.
 */
import { formatDateTime, parseTimestamp } from './format'

const props = defineProps<{ value: string | null | undefined; fallback?: string }>()
const { locale } = useI18n()

const local = ref(false)
onMounted(() => {
  local.value = true
})

const iso = computed(() => parseTimestamp(props.value)?.toISOString())
const text = computed(() => {
  const out = formatDateTime(props.value, locale.value, local.value ? undefined : 'UTC')
  return out === '' ? (props.fallback ?? '') : out
})
</script>

<template>
  <time v-if="iso" :datetime="iso">{{ text }}</time>
  <span v-else>{{ props.fallback ?? '' }}</span>
</template>
