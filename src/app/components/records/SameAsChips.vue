<script setup lang="ts">
/**
 * Die bestaetigten Normdaten-Zuordnungen einer Entitaet.
 *
 * Sie stehen neben dem Namen, nie an seiner Stelle: same_as ergaenzt has_name.
 */
import type { UiRef } from './model'

defineProps<{
  list: UiRef[]
  /**
   * Bezug auf die Zeile, zu der diese Zuordnungen gehoeren.
   *
   * Zwei Zeilen koennen dieselbe Kennung tragen; ohne den Bezug hiessen ihre
   * Knoepfe gleich.
   */
  scope: string
}>()
const emit = defineEmits<{ remove: [number]; detail: [string, string] }>()
const { t } = useI18n()
</script>

<template>
  <span v-if="list.length > 0" class="chips">
    <span v-for="(ref, i) in list" :key="ref.key" class="idbadge">
      <button type="button" class="idbadge-info"
              :title="t('records.editor.authority.detail')"
              @click="emit('detail', ref.source, ref.id)">
        <span class="sr-only">{{ scope }}</span>
        <span class="idbadge-src" :class="`src-${ref.source}`">{{ ref.source }}</span>
        <span v-if="ref.label && ref.label !== ref.id" class="idbadge-lab">{{ ref.label }}</span>
        <span v-if="ref.description" class="idbadge-desc">{{ ref.description }}</span>
        <span class="idbadge-id">{{ ref.id }}</span>
      </button>
      <button type="button" class="idbadge-x"
              :aria-label="t('records.editor.aria.inScope', {
                scope,
                text: t('records.editor.authority.remove', { source: ref.source, id: ref.id })
              })"
              @click="emit('remove', i)">×</button>
    </span>
  </span>
</template>
