<script setup lang="ts">
/**
 * Eine Konverterkette: Schritte in der Reihenfolge, in der sie laufen.
 *
 * Das Auswahlmenue der Konverter hat einen Schliessen-Knopf. Im PHP-Stand
 * fehlte er; das Menue liess sich nur durch erneutes Treffen desselben Knopfes
 * loswerden, und mehrere offene Menues ueberlagerten sich. Zusaetzlich
 * schliessen Escape und ein Klick daneben.
 */
import type { TransformOpMeta, TransformStep } from './types'
import MappingStep from './Step.vue'

const props = defineProps<{
  chain: TransformStep[]
  columns: string[]
  transforms: TransformOpMeta[]
  label: string
  enumValues: string[]
  sourceValues: Array<{ value: string; count: number }>
  idBase: string
}>()

const emit = defineEmits<{ change: [] }>()
const { t, te } = useI18n()

const picking = ref(false)
const root = ref<HTMLElement | null>(null)
const addButton = ref<HTMLButtonElement | null>(null)

const metaOf = (op: string): TransformOpMeta | null => props.transforms.find((m) => m.op === op) ?? null

function opLabel(meta: TransformOpMeta): string {
  const key = `mapping.op.${meta.op}`
  return te(key) ? t(key) : meta.label
}

const groups = computed(() => {
  const out = new Map<string, TransformOpMeta[]>()
  for (const meta of props.transforms) {
    const key = meta.group
    const list = out.get(key) ?? []
    list.push(meta)
    out.set(key, list)
  }
  return [...out.entries()].map(([group, items]) => ({ group, items }))
})

const groupLabel = useGroupLabel()

/** Neuer Schritt mit sinnvollen Vorgaben — sonst steht er halb leer da. */
function add(meta: TransformOpMeta) {
  const step: TransformStep = { op: meta.op } as TransformStep
  for (const param of meta.params) {
    if (param.type === 'choice') step[param.name] = Object.keys(param.choices ?? {})[0] ?? ''
    if (param.type === 'map') step.map = {}
    if (param.type === 'columns') step.columns = []
  }
  if (meta.op === 'map' && step.fallback === undefined) step.fallback = 'keep_note'
  props.chain.push(step)
  close()
  emit('change')
}

function remove(index: number) {
  props.chain.splice(index, 1)
  emit('change')
}

function move(index: number, delta: number) {
  const to = index + delta
  if (to < 0 || to >= props.chain.length) return
  const [step] = props.chain.splice(index, 1)
  if (step !== undefined) props.chain.splice(to, 0, step)
  emit('change')
}

function close() {
  picking.value = false
  nextTick(() => addButton.value?.focus())
}

function onDocClick(e: MouseEvent) {
  if (picking.value && root.value !== null && !root.value.contains(e.target as Node)) picking.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && picking.value) close()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="chain">
    <div v-if="label" :id="`${idBase}-label`" class="chain-label">{{ label }}</div>

    <p v-if="chain.length === 0" class="note" style="margin:0 0 6px">{{ t('mapping.chain.emptyHint') }}</p>

    <div v-for="(step, i) in chain" :key="`${idBase}-${i}`" style="position:relative">
      <MappingStep :step="step" :meta="metaOf(String(step.op))" :columns="columns" :enum-values="enumValues"
                   :source-values="sourceValues" :id-base="`${idBase}-s${i}`" :position="i + 1"
                   @change="emit('change')" @remove="remove(i)" />
      <div v-if="chain.length > 1" style="display:flex;gap:4px;margin:-4px 0 7px">
        <button type="button" class="linkbtn" :disabled="i === 0"
                :aria-label="t('mapping.chain.moveUp', { n: i + 1 })" @click="move(i, -1)">↑</button>
        <button type="button" class="linkbtn" :disabled="i === chain.length - 1"
                :aria-label="t('mapping.chain.moveDown', { n: i + 1 })" @click="move(i, 1)">↓</button>
      </div>
    </div>

    <div class="chain-add">
      <button ref="addButton" type="button" class="btn btn-outline btn-sm"
              :aria-expanded="picking ? 'true' : 'false'" @click="picking = !picking">
        + {{ t('mapping.chain.addStep') }}
      </button>

      <div v-if="picking" class="chain-picker" role="dialog" :aria-label="t('mapping.chain.pickerTitle')">
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px">
          <strong class="chain-pgroup-h" style="margin:0;flex:1">{{ t('mapping.chain.pickerTitle') }}</strong>
          <button type="button" class="modal-x" :aria-label="t('mapping.chain.closePicker')" @click="close">×</button>
        </div>
        <div v-for="g in groups" :key="g.group" class="chain-pgroup">
          <div class="chain-pgroup-h">{{ groupLabel(g.group) }}</div>
          <button v-for="meta in g.items" :key="meta.op" type="button" class="chain-pitem"
                  :title="meta.slow ? t('mapping.chain.slowHint') : undefined" @click="add(meta)">
            {{ opLabel(meta) }}<span v-if="meta.slow" aria-hidden="true"> ⏳</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
