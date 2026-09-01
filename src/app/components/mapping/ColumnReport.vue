<script setup lang="ts">
/**
 * Abgleich der Profilspalten gegen die tatsaechliche Kopfzeile.
 *
 * Fehlende, zusaetzliche und vermutlich umbenannte Spalten werden benannt —
 * der Vertrag verlangt, dass sie beim Einlesen verstaendlich angezeigt werden.
 * "Verstaendlich" heisst hier: mit Spaltennamen, nicht mit einer Zahl.
 */
import type { ColumnReport } from './types'

const props = defineProps<{ report: ColumnReport | null }>()
const { t } = useI18n()

const relevant = computed(() =>
  props.report !== null &&
  (props.report.missing.length > 0 || props.report.extra.length > 0 || props.report.renamed.length > 0)
)

/**
 * Der Summensatz wird hier aus den Zahlen gebildet, nicht vom Server
 * uebernommen: report.summary ist ein fertiger deutscher Satz und bliebe in der
 * englischen Oberflaeche deutsch.
 */
const summary = computed(() => {
  const r = props.report
  if (r === null) return ''
  const total = r.matched.length + r.extra.length
  const parts = [t('mapping.columns.summaryMatched', { matched: r.matched.length, total })]
  if (r.missing.length > 0) parts.push(t('mapping.columns.summaryMissing', { n: r.missing.length }, r.missing.length))
  if (r.extra.length > 0) parts.push(t('mapping.columns.summaryExtra', { n: r.extra.length }, r.extra.length))
  if (r.renamed.length > 0) parts.push(t('mapping.columns.summaryRenamed', { n: r.renamed.length }, r.renamed.length))
  return parts.join(', ') + '.'
})
</script>

<template>
  <div class="live-region" role="status" aria-live="polite">
    <div v-if="relevant && report" class="ui-alert" style="margin-bottom:14px">
      <strong>{{ t('mapping.columns.heading') }}</strong>
      <span class="dim small"> {{ summary }}</span>
      <ul class="tight">
        <li v-if="report.missing.length">
          {{ t('mapping.columns.missing', { n: report.missing.length }) }}
          <span class="mono">{{ report.missing.join(', ') }}</span>
        </li>
        <li v-if="report.extra.length">
          {{ t('mapping.columns.extra', { n: report.extra.length }) }}
          <span class="mono">{{ report.extra.join(', ') }}</span>
        </li>
        <li v-for="rename in report.renamed" :key="rename.from">
          {{ t('mapping.columns.renamed', {
            from: rename.from, to: rename.to, percent: Math.round(rename.similarity * 100) }) }}
        </li>
      </ul>
    </div>
  </div>
</template>
