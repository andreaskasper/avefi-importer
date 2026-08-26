<script setup lang="ts">
/**
 * Eine Zeile „Beteiligte": Taetigkeit, Rolle, Person oder Koerperschaft.
 *
 * Die Rollenliste haengt an der Taetigkeit und kommt aus dem Schema. Fehlt sie,
 * schaltet das Feld auf freie Eingabe um, statt eine leere Auswahl anzubieten.
 */
import { addSameAs, type UiActivity } from './model'
import type { ActivityCategory, AuthorityHit, EditorConfig } from './types'

const props = defineProps<{
  act: UiActivity
  categories: ActivityCategory[]
  config: EditorConfig
  idPrefix: string
  /** Laufende Nummer der Zeile, ab 1. Sie steht in jedem Namen dieser Zeile. */
  index: number
  /** Zugaenglicher Name des Loeschknopfs, samt laufender Nummer. */
  removeLabel: string
}>()

const emit = defineEmits<{ remove: []; detail: [string, string]; change: [] }>()
const { t } = useI18n()

const roleValues = computed(() => {
  const found = props.categories.find((c) => c.category === props.act.category)
  return found === undefined ? [] : (props.config.enums[found.enumName] ?? [])
})

const kind = computed(() => (props.act.agentType === 'CorporateBody' ? 'corporate' : 'person'))

/** Bezug auf diese Zeile: Name und laufende Nummer. */
const rowScope = computed(() => t('records.editor.aria.rowName', {
  name: props.act.name.trim() === '' ? t('records.editor.activity.person') : props.act.name.trim(),
  index: props.index
}))

function take(hit: AuthorityHit) {
  addSameAs(props.act.same_as, hit)
  emit('change')
}

function removeRef(index: number) {
  props.act.same_as.splice(index, 1)
  emit('change')
}
</script>

<template>
  <div class="ed-entity">
    <select class="input kindsel" :value="act.category" :aria-label="t('records.editor.activity.category')"
            @change="act.category = ($event.target as HTMLSelectElement).value; act.type = ''; emit('change')">
      <option v-for="c in categories" :key="c.category" :value="c.category">
        {{ t(`records.editor.activity.${c.category}`) }}
      </option>
    </select>

    <RecordsEnumSelect
      :id="`${idPrefix}-role`"
      v-model="act.type"
      :values="roleValues"
      :label="t('records.editor.activity.role')"
      :placeholder="t('records.editor.activity.role')" />

    <div class="ed-entity-main">
      <RecordsAuthorityField
        :id="`${idPrefix}-name`"
        v-model="act.name"
        :kind="kind"
        :label="t('records.editor.activity.person')"
        :placeholder="t('records.editor.authority.search', { kind: t('records.editor.activity.person') })"
        @pick="take" />
      <RecordsSameAsChips :list="act.same_as" :scope="rowScope" @remove="removeRef"
                          @detail="(s, i) => emit('detail', s, i)" />
    </div>

    <button type="button" class="iconbtn-del" :aria-label="removeLabel"
            @click="emit('remove')"><span aria-hidden="true">🗑</span></button>
  </div>
</template>

<style scoped>
.kindsel { max-width: 170px }
</style>
