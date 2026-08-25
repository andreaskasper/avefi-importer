<script setup lang="ts">
/**
 * Suche nach einem Schemafeld.
 *
 * Gesucht wird ueber Feldschluessel, verstaendliche Bezeichnung, Gruppe und
 * Schemapfad — der Vertrag verlangt mindestens Feldnamen und Bezeichnungen.
 * Bewusst eine einfache Wortsuche ohne Rangfolgekunst: Wer "regie" tippt, will
 * die Regie sehen, nicht eine Trefferliste erklaert bekommen.
 *
 * Zum ausgewaehlten Feld stehen vollstaendiger Schemapfad und kurze
 * Beschreibung darunter — ebenfalls Vertragsanforderung.
 *
 * Bedienung mit der Tastatur: Pfeiltasten, Pos1/Ende, Enter uebernimmt,
 * Escape schliesst. Das Feld ist eine Combobox nach WAI-ARIA.
 */
import type { EditorTarget } from './types'

const props = defineProps<{
  modelValue: string
  targets: EditorTarget[]
  label: string
  /** Eindeutig je Vorkommen — verbindet Beschriftung, Eingabe und Liste. */
  inputId: string
  describedBy?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t, te } = useI18n()

const query = ref('')
const openList = ref(false)
const activeIndex = ref(-1)
const root = ref<HTMLElement | null>(null)

const byKey = computed(() => new Map(props.targets.map((x) => [x.key, x])))
const selected = computed(() => byKey.value.get(props.modelValue) ?? null)

/** Bezeichnung eines Ziels: eigener Schluessel, sonst der Katalogtext. */
function labelOf(target: EditorTarget): string {
  const key = `mapping.targets.${target.key}`
  return te(key) ? t(key) : target.label
}
function describe(target: EditorTarget): string {
  const key = `mapping.targetDescs.${target.key}`
  if (te(key)) return t(key)
  return target.description ?? ''
}
function levelLabel(level: string): string {
  return t(`mapping.level.${level}`)
}
const groupLabel = useGroupLabel()
function pathOf(target: EditorTarget): string {
  return `${levelLabel(target.level)} › ${groupLabel(target.group)} › ${labelOf(target)}`
}

const words = computed(() =>
  query.value.trim().toLowerCase().split(/[^\p{L}\p{N}_.]+/u).filter((w) => w !== '')
)

const matches = computed(() => {
  const list = props.targets
  if (words.value.length === 0) return list.slice(0, 40)
  return list
    .filter((target) => {
      const haystack = [...target.search, labelOf(target).toLowerCase(), describe(target).toLowerCase()].join(' ')
      return words.value.every((w) => haystack.includes(w))
    })
    .slice(0, 40)
})

watch(matches, () => {
  activeIndex.value = matches.value.length > 0 ? 0 : -1
})

function optionId(index: number): string {
  return `${props.inputId}-opt-${index}`
}

function choose(target: EditorTarget) {
  emit('update:modelValue', target.key)
  query.value = ''
  openList.value = false
  activeIndex.value = -1
}

function clear() {
  emit('update:modelValue', '')
  query.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (openList.value) {
      e.stopPropagation()
      openList.value = false
    }
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    if (!openList.value) openList.value = true
    const last = matches.value.length - 1
    if (last < 0) return
    e.preventDefault()
    if (e.key === 'Home') activeIndex.value = 0
    else if (e.key === 'End') activeIndex.value = last
    else if (e.key === 'ArrowDown') activeIndex.value = activeIndex.value >= last ? 0 : activeIndex.value + 1
    else activeIndex.value = activeIndex.value <= 0 ? last : activeIndex.value - 1
    nextTick(() => {
      document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' })
    })
    return
  }
  if (e.key === 'Enter' && openList.value) {
    const hit = matches.value[activeIndex.value]
    if (hit !== undefined) {
      e.preventDefault()
      choose(hit)
    }
  }
}

function onDocClick(e: MouseEvent) {
  if (openList.value && root.value !== null && !root.value.contains(e.target as Node)) openList.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="branch-target">
    <label class="step-plabel" :for="inputId">{{ label }}</label>

    <div class="ac-wrap">
      <input :id="inputId" class="input" type="text" role="combobox" autocomplete="off" spellcheck="false"
             :aria-expanded="openList ? 'true' : 'false'" :aria-controls="`${inputId}-list`"
             :aria-activedescendant="openList && activeIndex >= 0 ? optionId(activeIndex) : undefined"
             :aria-describedby="describedBy"
             :value="openList ? query : (selected ? pathOf(selected) : '')"
             :placeholder="t('mapping.target.search')"
             @focus="openList = true"
             @input="query = ($event.target as HTMLInputElement).value; openList = true"
             @keydown="onKeydown">

      <ul v-show="openList" :id="`${inputId}-list`" class="ac-menu" role="listbox" :aria-label="label">
        <li v-if="matches.length === 0" class="ac-item" role="presentation">
          <span class="dim small">{{ t('mapping.target.noMatch') }}</span>
        </li>
        <li v-for="(target, i) in matches" :id="optionId(i)" :key="target.key" role="option"
            :aria-selected="target.key === modelValue ? 'true' : 'false'"
            :class="['ac-item', i === activeIndex ? 'on' : '']"
            style="cursor:pointer"
            @mouseenter="activeIndex = i" @click="choose(target)">
          <span class="ac-src" :class="`src-${target.level}`">{{ levelLabel(target.level) }}</span>
          <span class="ac-lab">{{ labelOf(target) }}</span>
          <span class="ac-desc mono">{{ target.schemaPath }}</span>
        </li>
      </ul>
    </div>

    <p v-if="selected" class="note" style="margin-top:4px">
      <span class="mono">{{ selected.schemaPath }}</span>
      <template v-if="describe(selected)"> — {{ describe(selected) }}</template>
      <br>
      <span class="dim">{{ selected.multi ? t('mapping.target.multi') : t('mapping.target.single') }}</span>
      <template v-if="selected.enumValues && selected.enumValues.length">
        · {{ t('mapping.target.enumCount', { n: selected.enumValues.length }) }}
      </template>
      <template v-if="selected.acceptsAuthority"> · {{ t('mapping.target.authority') }}</template>
      <button type="button" class="linkbtn" style="margin-left:8px" @click="clear">{{ t('mapping.target.clear') }}</button>
    </p>
    <p v-else class="note" style="margin-top:4px">{{ t('mapping.target.none') }}</p>
  </div>
</template>

<style scoped>
/* Der Tastaturfokus liegt im Eingabefeld; ohne diese Markierung waere nicht zu
   sehen, welcher Eintrag mit Enter uebernommen wird. */
.ac-item.on { background: var(--primary-100); }
.ac-menu { list-style: none; margin: 0; padding: 0; }
</style>
