<script setup lang="ts">
/**
 * Steht der Gesamtimport gegen das AVefi-Schema — und wenn nein, wie oft nicht?
 *
 * Die Liste zeigte bisher nur den Verarbeitungsstand. "Konvertiert" sagt aber
 * nichts darueber, ob das Ergebnis die Schemapruefung besteht; dafuer musste
 * man jeden Import einzeln oeffnen. Zwei Rueckmeldungen aus derselben Runde:
 * Matti Stoehr wollte den Gesamtstatus des Exports ausdruecklich ausgewiesen
 * haben (Termin am 01.09.2026), Jasper Stratil wollte in der Importliste
 * sehen, ob Beanstandungen vorliegen (Pad, 01.09.2026).
 *
 * Das Abzeichen steht in derselben Spalte wie der Verarbeitungsstand und nicht
 * in einer eigenen. Eine achte Spalte haette die Tabelle bei schmalen Fenstern
 * ins Waagerecht-Scrollen gedraengt, und genau dort wird getestet.
 *
 * "Keine Beanstandungen" wird ausgesprochen, nicht weggelassen. Ein fehlendes
 * Abzeichen ist keine Aussage: Wer nichts sieht, weiss nicht, ob geprueft
 * wurde.
 */
import { BUSY_STATES } from './types'
import type { ImportListItem } from './types'

const props = defineProps<{ item: ImportListItem }>()
const { t } = useI18n()

type Ampel = 'laeuft' | 'ungeprueft' | 'beanstandet' | 'hinweise' | 'validiert'

const zustand = computed<Ampel>(() => {
  if (BUSY_STATES.has(props.item.status)) return 'laeuft'
  if (!props.item.hasReport) return 'ungeprueft'
  if ((props.item.issues.error ?? 0) > 0) return 'beanstandet'
  if ((props.item.issues.warning ?? 0) > 0) return 'hinweise'
  return props.item.validated ? 'validiert' : 'ungeprueft'
})

const FARBE: Record<Ampel, string> = {
  laeuft: 'b-info',
  ungeprueft: 'b-neutral',
  beanstandet: 'b-danger',
  hinweise: 'b-wait',
  validiert: 'b-ok'
}

const text = computed(() => {
  const z = zustand.value
  if (z === 'beanstandet') {
    const n = props.item.issues.error ?? 0
    return t('imports.validation.beanstandet', { n }, n)
  }
  if (z === 'hinweise') {
    const n = props.item.issues.warning ?? 0
    return t('imports.validation.hinweise', { n }, n)
  }
  return t(`imports.validation.${z}`)
})

/** Nur wo es etwas zu lesen gibt, fuehrt das Abzeichen auch hin. */
const ziel = computed(() => (props.item.hasReport ? `/imports/${props.item.id}/report` : null))
</script>

<template>
  <NuxtLink v-if="ziel !== null" :to="ziel" class="badge" :class="FARBE[zustand]"
            :aria-label="t('imports.validation.gotoReport', { file: item.filename, state: text })">
    <span class="bd" aria-hidden="true" />{{ text }}
  </NuxtLink>
  <span v-else class="badge" :class="FARBE[zustand]">
    <span class="bd" aria-hidden="true" />{{ text }}
  </span>
</template>
