<script setup lang="ts">
import { recordsService } from '~/services/records'
/**
 * Namensfeld mit Normdatensuche.
 *
 * Die Suche laeuft auf dem Server; welche Quellen fuer diese Art erlaubt sind,
 * entscheidet dort das Schema. Ausgewaehlt wird von Hand — der Trefferliste
 * folgt nie eine automatische Uebernahme.
 */
import { apiFailure, failureText } from './errors'
import type { AuthorityHit, AuthoritySearchResponse } from './types'

const datensaetze = recordsService()

const props = withDefaults(
  defineProps<{
    modelValue: string
    kind: string
    placeholder?: string
    id?: string
    label?: string
  }>(),
  { placeholder: undefined, id: undefined, label: undefined }
)

const emit = defineEmits<{ 'update:modelValue': [string]; pick: [AuthorityHit] }>()
const { t, te } = useI18n()

const open = ref(false)
const loading = ref(false)
const results = ref<AuthorityHit[]>([])
const warnings = ref<string[]>([])
const problem = ref('')
const highlight = ref(-1)

let timer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

const listId = computed(() => `${props.id ?? 'ac'}-results`)

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  emit('update:modelValue', value)
  if (timer !== null) clearTimeout(timer)
  if (value.trim().length < 2) {
    results.value = []
    open.value = false
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(() => void search(value), 300)
}

async function search(value: string) {
  const mine = ++sequence
  problem.value = ''
  try {
    const res = await datensaetze.normdatenSuche(props.kind, value.trim())
    if (mine !== sequence) return
    results.value = res.results
    warnings.value = res.warnings
    open.value = true
  } catch (e) {
    if (mine !== sequence) return
    results.value = []
    warnings.value = []
    problem.value = failureText(t, te, apiFailure(e))
    open.value = true
  } finally {
    if (mine === sequence) loading.value = false
  }
}

function pick(hit: AuthorityHit) {
  emit('pick', hit)
  close()
}

function close() {
  open.value = false
  highlight.value = -1
}

/** Tastaturbedienung: Pfeile waehlen, Enter uebernimmt, Escape schliesst. */
function onKeydown(e: KeyboardEvent) {
  if (!open.value || results.value.length === 0) {
    if (e.key === 'Escape') close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlight.value = (highlight.value + 1) % results.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlight.value = (highlight.value - 1 + results.value.length) % results.value.length
  } else if (e.key === 'Enter' && highlight.value >= 0) {
    e.preventDefault()
    const hit = results.value[highlight.value]
    if (hit !== undefined) pick(hit)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

function onBlur() {
  // Erst nach dem Klick schliessen, sonst geht die Auswahl verloren.
  setTimeout(close, 160)
}

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <div class="ac-wrap">
    <input :id="id" class="ui-input" type="text" role="combobox" autocomplete="off"
           :value="modelValue" :placeholder="placeholder" :aria-label="label"
           :aria-expanded="open" :aria-controls="listId" aria-autocomplete="list"
           @input="onInput" @keydown="onKeydown" @blur="onBlur"
           @focus="open = results.length > 0 || problem !== ''">
    <div v-if="open" :id="listId" class="ac-menu" role="listbox">
      <div v-if="problem !== ''" class="ac-item dim">{{ problem }}</div>
      <template v-else>
        <button v-for="(hit, i) in results" :key="`${hit.source}-${hit.id}`" type="button" role="option"
                class="ac-item" :class="{ on: i === highlight }" :aria-selected="i === highlight"
                @mousedown.prevent="pick(hit)">
          <span class="ac-src" :class="`src-${hit.source}`">{{ hit.source }}</span>
          <span class="ac-lab">{{ hit.label }}</span>
          <span v-if="hit.description" class="ac-desc">{{ hit.description }}</span>
          <span class="ac-id">{{ hit.id }}</span>
        </button>
        <div v-if="results.length === 0 && !loading" class="ac-item dim">
          {{ t('records.editor.authority.noResults') }}
        </div>
        <div v-if="warnings.length > 0" class="ac-item dim small">
          {{ t('records.editor.authority.sourceFailed', { list: warnings.join('; ') }) }}
        </div>
      </template>
    </div>
    <div v-else-if="loading" class="ac-menu">
      <div class="ac-item dim">{{ t('records.editor.authority.searching') }}</div>
    </div>
  </div>
</template>

<style scoped>
.ac-item.on { background: var(--surface-2) }
</style>
