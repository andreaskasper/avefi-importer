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
import { parseTimestamp } from './format'

const props = defineProps<{ value: string | null | undefined; fallback?: string }>()

/* Die Zweiteilung steht in useDateTime(); hier bleibt nur die Auszeichnung als
 * <time> mit maschinenlesbarem Wert. */
const zeit = useDateTime()

const iso = computed(() => parseTimestamp(props.value)?.toISOString())
const text = computed(() => zeit.value(props.value, props.fallback ?? ''))
</script>

<template>
  <time v-if="iso" :datetime="iso">{{ text }}</time>
  <span v-else>{{ props.fallback ?? '' }}</span>
</template>
