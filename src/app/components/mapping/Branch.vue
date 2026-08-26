<script setup lang="ts">
/**
 * Die Verzweigung einer Quellspalte, sichtbar gemacht.
 *
 * Spalte → gemeinsame Kette (pre) → je Zweig eigene Kette (post) und eigenes
 * Ziel. Das Datenmodell konnte das von Anfang an; die Oberflaeche zeigte es
 * nicht — und die Faehigkeit galt deshalb als nicht vorhanden. Eine Faehigkeit,
 * die man nicht sieht, hat man nicht.
 *
 * Unter jedem Zweig steht das Ergebnis GENAU DIESES Zweigs auf denselben
 * Beispielzeilen wie in der Tabelle daneben.
 */
import type { ColumnMapping } from '#shared/types/domain'
import type { AuthorityRequest, EditorTarget, PreviewExample, TransformOpMeta, TransformStep } from './types'
import MappingChain from './Chain.vue'
import MappingTargetSelect from './TargetSelect.vue'

const props = defineProps<{
  column: string
  spec: ColumnMapping
  columns: string[]
  targets: EditorTarget[]
  transforms: TransformOpMeta[]
  examples: PreviewExample[]
  values: Array<{ value: string; count: number }>
  fillLabel: string
  index: number
}>()

const emit = defineEmits<{
  change: []
  authority: [request: AuthorityRequest]
  clearAuthority: [value: string]
}>()

const { t, te } = useI18n()
const root = ref<HTMLElement | null>(null)

/**
 * Fokus in das Element setzen, das nach einer Aenderung neu entsteht.
 * Ohne das faellt der Fokus auf <body>, sobald der ausloesende Knopf aus dem
 * Baum verschwindet — und der Weg zurueck beginnt am Seitenanfang.
 */
function focusInBranch(index: number, auswahl: string) {
  void nextTick(() => {
    const zweig = root.value?.querySelectorAll<HTMLElement>('.branch-item')[index]
    zweig?.querySelector<HTMLElement>(auswahl)?.focus()
  })
}

const idBase = computed(() => `col${props.index}`)
const byKey = computed(() => new Map(props.targets.map((x) => [x.key, x])))

function labelOf(key: string): string {
  const target = byKey.value.get(key)
  if (target === undefined) return key
  const i18nKey = `mapping.targets.${key}`
  return te(i18nKey) ? t(i18nKey) : target.label
}

function enumValuesFor(key: string): string[] {
  return byKey.value.get(key)?.enumValues ?? []
}

/** Kette eines Zweigs = gemeinsame Vorkette plus eigene Nachkette. */
function fullChain(index: number): TransformStep[] {
  const post = props.spec.targets?.[index]?.post ?? []
  return [...(props.spec.pre ?? []), ...post]
}

function authorityStep(index: number): TransformStep | null {
  return fullChain(index).find((s) => String(s.op) === 'authority') ?? null
}

function hasValuemap(index: number): boolean {
  return fullChain(index).some((s) => String(s.op) === 'map')
}

/** Die Ketten liegen nach dem Aufbereiten in Editor.vue immer als Feld vor;
 *  die Absicherung faengt nur ein von Hand eingelesenes Profil ab. */
function preChain(): TransformStep[] {
  if (!Array.isArray(props.spec.pre)) props.spec.pre = []
  return props.spec.pre
}

function postChain(index: number): TransformStep[] {
  const binding = props.spec.targets?.[index]
  if (binding === undefined) return []
  if (!Array.isArray(binding.post)) binding.post = []
  return binding.post
}

function outputsFor(example: PreviewExample, key: string) {
  return (example.outputs ?? []).filter((o) => o.target === key)
}

function addTarget() {
  props.spec.ignore = false
  if (!Array.isArray(props.spec.targets)) props.spec.targets = []
  props.spec.targets.push({ target: '', post: [] })
  focusInBranch(props.spec.targets.length - 1, 'input[role="combobox"]')
  emit('change')
}

function removeTarget(index: number) {
  props.spec.targets?.splice(index, 1)
  // Der geloeschte Zweig nimmt seinen Knopf mit; der Fokus geht auf „Zweig
  // hinzufuegen", das einzige Element, das sicher stehen bleibt.
  void nextTick(() => root.value?.querySelector<HTMLElement>('.branch-add-item button')?.focus())
  emit('change')
}

function setTarget(index: number, key: string) {
  const binding = props.spec.targets?.[index]
  if (binding === undefined) return
  binding.target = key
  emit('change')
}

/** Werteliste anlegen — angeboten, nie von selbst gesetzt. */
function addValuemap(index: number) {
  const binding = props.spec.targets?.[index]
  if (binding === undefined) return
  if (!Array.isArray(binding.post)) binding.post = []
  binding.post.push({ op: 'map', map: {}, fallback: 'keep_note' } as TransformStep)
  focusInBranch(index, '.authpanel select, .authpanel input')
  emit('change')
}

/* --------------------------------------------------------------- Normdaten */

function authorityEntry(value: string) {
  return props.spec.authorities?.[value]
}

function authorityState(value: string): 'bestaetigt' | 'verworfen' | 'offen' {
  const entry = authorityEntry(value)
  if (entry === undefined) return 'offen'
  return entry.id !== '' ? 'bestaetigt' : 'verworfen'
}

/** Werte, fuer die sich eine Zuordnung lohnt: was in der Datei vorkommt. */
const authorityValues = computed(() => {
  if (props.values.length > 0) return props.values.slice(0, 25).map((v) => v.value)
  return props.examples.map((e) => e.raw)
})
</script>

<template>
  <div ref="root" class="branch">
    <div class="branch-src">
      <span class="branch-col"><i aria-hidden="true">▤</i>{{ column }}</span>
      <span v-if="fillLabel" class="dim small">{{ fillLabel }}</span>
    </div>

    <div class="branch-global">
      <MappingChain :chain="preChain()" :columns="columns" :transforms="transforms"
                    :label="t('mapping.branch.preLabel')" :enum-values="[]" :source-values="values"
                    :id-base="`${idBase}-pre`" @change="emit('change')" />
    </div>

    <div class="branch-list">
      <div v-for="(binding, i) in (spec.targets ?? [])" :key="i" class="branch-item">
        <div class="branch-connector" aria-hidden="true" />
        <div class="branch-body">
          <div class="branch-head">
            <span class="branch-no">{{ t('mapping.branch.number', { n: i + 1 }) }}</span>
            <span v-if="binding.target && !byKey.has(binding.target)" class="badge b-danger">
              <span class="bd" />{{ t('mapping.branch.unknownTarget') }}
            </span>
            <button type="button" class="iconbtn-del"
                    :aria-label="t('mapping.branch.remove', { n: i + 1, column })" @click="removeTarget(i)">✕</button>
          </div>

          <MappingChain :chain="postChain(i)" :columns="columns" :transforms="transforms"
                        :label="t('mapping.branch.postLabel')" :enum-values="enumValuesFor(binding.target)"
                        :source-values="values" :id-base="`${idBase}-b${i}`" @change="emit('change')" />

          <MappingTargetSelect :model-value="binding.target" :targets="targets"
                               :label="t('mapping.branch.targetLabel', { n: i + 1 })"
                               :input-id="`${idBase}-b${i}-target`"
                               @update:model-value="setTarget(i, $event)" />

          <div v-if="enumValuesFor(binding.target).length > 0 && !hasValuemap(i)" class="vocabhint">
            <span class="dim small">{{ t('mapping.branch.enumHint') }}</span>
            <button type="button" class="btn btn-outline btn-sm" @click="addValuemap(i)">
              {{ t('mapping.branch.addValuemap') }}
            </button>
          </div>

          <div v-if="examples.length" class="branch-result">
            <div v-for="(example, j) in examples" :key="j" class="exline">
              <span class="exraw" :title="example.raw">{{ example.raw }}</span>
              <i class="exarrow" aria-hidden="true">→</i>
              <span v-if="outputsFor(example, binding.target).length" class="okval">
                <i aria-hidden="true">✓</i>{{ outputsFor(example, binding.target).map((o) => o.value).join(' · ') }}
              </span>
              <span v-else-if="example.errors.length" class="errval" :title="example.errors.join(' · ')">
                <i aria-hidden="true">⚠</i>{{ example.errors[0] }}
              </span>
              <span v-else class="dim">{{ t('mapping.branch.noValue') }}</span>
            </div>
          </div>
          <p v-else class="branch-result dim small">{{ t('mapping.branch.noExample') }}</p>

          <div v-if="authorityStep(i)" class="authpanel">
            <div class="authpanel-h">
              <span>{{ t('mapping.authority.heading', {
                source: String(authorityStep(i)?.source ?? 'gnd').toUpperCase() }) }}</span>
              <span class="dim small">{{ t('mapping.authority.note') }}</span>
            </div>
            <div v-for="value in authorityValues" :key="value" class="authrow">
              <span class="authval" :title="value">{{ value }}</span>
              <span class="authstate" :class="`st-${authorityState(value)}`">
                <template v-if="authorityState(value) === 'bestaetigt'">
                  {{ authorityEntry(value)?.id }}
                  <span class="dim">{{ authorityEntry(value)?.label }}</span>
                </template>
                <template v-else-if="authorityState(value) === 'verworfen'">{{ t('mapping.authority.left') }}</template>
                <template v-else>{{ t('mapping.authority.auto') }}</template>
              </span>
              <button type="button" class="btn btn-outline btn-sm"
                      @click="emit('authority', {
                        column,
                        value,
                        source: String(authorityStep(i)?.source ?? 'gnd'),
                        kind: String(authorityStep(i)?.kind ?? 'person')
                      })">{{ t('mapping.authority.assign') }}</button>
              <button v-if="authorityState(value) !== 'offen'" type="button" class="linkbtn"
                      @click="emit('clearAuthority', value)">{{ t('mapping.authority.reset') }}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="branch-item branch-add-item">
        <div class="branch-connector" aria-hidden="true" />
        <button type="button" class="btn btn-outline btn-sm" @click="addTarget">
          + {{ t('mapping.branch.add') }}
        </button>
        <p class="note" style="margin-top:6px">{{ t('mapping.branch.addHint') }}</p>
      </div>
    </div>
  </div>
</template>
