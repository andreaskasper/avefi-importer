<script setup lang="ts">
/**
 * Kontrolliertes Vokabular: Quellwerte auf AVefi-Werte abbilden.
 *
 * Gezeigt werden die Werte, die in der Datei TATSAECHLICH vorkommen, mit ihrer
 * Haeufigkeit — daneben die Auswahl der zulaessigen AVefi-Werte aus dem Schema.
 * Nicht zugeordnete Werte bleiben sichtbar markiert; sie sind der haeufigste
 * Grund fuer leere Felder im Ergebnis.
 *
 * Eine leere Zuordnung ist nicht dasselbe wie keine Zuordnung: Solange kein
 * Zielwert eingetragen ist, kommt fuer die Spalte nichts an. Deshalb steht die
 * Zahl der offenen Werte immer daneben.
 */
import type { TransformStep } from './types'

const props = defineProps<{
  step: TransformStep
  enumValues: string[]
  /** Werte der Quelle mit Haeufigkeit. */
  sourceValues: Array<{ value: string; count: number }>
  idBase: string
}>()

const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()

const added = ref<string[]>([])
const manual = ref('')

const map = computed<Record<string, string>>(() => {
  const raw = props.step.map
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, string>) : {}
})

/** Zeilen: was in der Datei steht, was schon zugeordnet ist, was von Hand kam. */
const rows = computed(() => {
  const counts = new Map(props.sourceValues.map((v) => [v.value, v.count]))
  const keys: string[] = []
  for (const v of props.sourceValues) keys.push(v.value)
  for (const k of Object.keys(map.value)) if (!keys.includes(k)) keys.push(k)
  for (const k of added.value) if (!keys.includes(k)) keys.push(k)
  return keys.map((value) => ({
    value,
    count: counts.get(value) ?? 0,
    target: map.value[value] ?? '',
    /** Zielwert steht nicht in der Werteliste des Schemas. */
    invalid: (map.value[value] ?? '') !== '' && !props.enumValues.includes(map.value[value] ?? '')
  }))
})

const openCount = computed(() => rows.value.filter((r) => r.target === '').length)
const invalidCount = computed(() => rows.value.filter((r) => r.invalid).length)

function set(value: string, target: string) {
  const next = { ...map.value }
  if (target === '') delete next[value]
  else next[value] = target
  props.step.map = next
  emit('change')
}

function addManual() {
  const v = manual.value.trim()
  if (v === '') return
  if (!added.value.includes(v)) added.value.push(v)
  manual.value = ''
}

function prefill() {
  const next = { ...map.value }
  for (const v of props.sourceValues) if (next[v.value] === undefined) next[v.value] = ''
  props.step.map = next
  emit('change')
}
</script>

<template>
  <div class="authpanel">
    <div class="authpanel-h">
      <span>{{ t('mapping.vocab.heading') }}</span>
      <span v-if="openCount > 0" class="badge b-warn"><span class="bd" />{{ t('mapping.vocab.open', { n: openCount }) }}</span>
      <span v-else-if="rows.length > 0" class="badge b-ok"><span class="bd" />{{ t('mapping.vocab.allMapped') }}</span>
      <span v-if="invalidCount > 0" class="badge b-danger"><span class="bd" />{{ t('mapping.vocab.invalid', { n: invalidCount }) }}</span>
    </div>

    <p v-if="rows.length === 0" class="note" style="margin:0 0 8px">{{ t('mapping.vocab.empty') }}</p>

    <table v-else class="maptable" style="margin-bottom:8px">
      <caption class="sr-only">{{ t('mapping.vocab.caption') }}</caption>
      <colgroup><col style="width:42%"><col style="width:14%"><col style="width:44%"></colgroup>
      <thead>
        <tr>
          <th scope="col">{{ t('mapping.vocab.sourceValue') }}</th>
          <th scope="col">{{ t('mapping.vocab.count') }}</th>
          <th scope="col">{{ t('mapping.vocab.avefiValue') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="row.value">
          <td><span class="fn" :title="row.value">{{ row.value }}</span></td>
          <td class="tnum dim small">{{ row.count > 0 ? row.count : '–' }}</td>
          <td>
            <label class="sr-only" :for="`${idBase}-v${i}`">
              {{ t('mapping.vocab.selectFor', { value: row.value }) }}
            </label>
            <select :id="`${idBase}-v${i}`" class="input" :value="row.target"
                    @change="set(row.value, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ t('mapping.vocab.unmapped') }}</option>
              <option v-if="row.invalid" :value="row.target">{{ row.target }} ({{ t('mapping.vocab.notInSchema') }})</option>
              <option v-for="v in enumValues" :key="v" :value="v">{{ v }}</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="vocabhint">
      <button type="button" class="btn btn-outline btn-sm" @click="prefill">{{ t('mapping.vocab.prefill') }}</button>
      <label class="sr-only" :for="`${idBase}-manual`">{{ t('mapping.vocab.addLabel') }}</label>
      <input :id="`${idBase}-manual`" v-model="manual" class="input" style="max-width:180px"
             :placeholder="t('mapping.vocab.addLabel')" @keydown.enter.prevent="addManual">
      <button type="button" class="btn btn-outline btn-sm" @click="addManual">{{ t('mapping.vocab.add') }}</button>
    </div>
  </div>
</template>
