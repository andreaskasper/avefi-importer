<script setup lang="ts">
/**
 * Was aus einer Quellzeile entsteht: die AVefi-Struktur je Ebene.
 *
 * Das ist die grafische Haelfte des Editors. Verbindungslinien zwischen zwei
 * Spalten sehen bei fuenf Feldern gut aus und werden bei vierzig unbedienbar —
 * erst recht mit Tastatur oder Screenreader. Hier steht stattdessen das
 * Ergebnis, und daneben, woher es kommt.
 */
import type { EditorTarget } from './types'

const props = defineProps<{
  targets: EditorTarget[]
  targetUse: Record<string, Array<{ column: string; source: 'column' | 'default' }>>
}>()

const { t, te } = useI18n()
const levels = ['work', 'manifestation', 'item'] as const

function labelOf(target: EditorTarget): string {
  const key = `mapping.targets.${target.key}`
  return te(key) ? t(key) : target.label
}

const byLevel = computed(() => {
  const byKey = new Map(props.targets.map((x) => [x.key, x]))
  const out: Record<string, Array<{ key: string; label: string; group: string; from: Array<{ column: string; source: string }> }>> = {
    work: [], manifestation: [], item: []
  }
  for (const [key, from] of Object.entries(props.targetUse)) {
    const target = byKey.get(key)
    if (target === undefined) continue
    out[target.level]?.push({ key, label: labelOf(target), group: target.group, from })
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => (a.group + a.label).localeCompare(b.group + b.label))
  }
  return out
})
</script>

<template>
  <div>
    <div v-for="level in levels" :key="level" class="treelvl">
      <h3 class="treelvl-h">
        <span class="lvlbadge" :class="`lvl-${level}`" aria-hidden="true" />
        {{ t(`mapping.level.${level}`) }}
      </h3>
      <ul v-if="byLevel[level].length" class="treelist">
        <li v-for="node in byLevel[level]" :key="node.key">
          <span class="tl-label">{{ node.label }}</span>
          <span class="dim small tl-from" :title="node.from.map((f) => f.source === 'default' ? t('mapping.tree.default') : f.column).join(', ')">
            <template v-for="(f, i) in node.from" :key="i">
              <span>{{ f.source === 'default' ? t('mapping.tree.default') : f.column }}</span><span v-if="i < node.from.length - 1">, </span>
            </template>
          </span>
        </li>
      </ul>
      <p v-else class="dim small" style="margin:0">{{ t('mapping.tree.empty') }}</p>
    </div>
  </div>
</template>
