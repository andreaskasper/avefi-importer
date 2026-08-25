<script setup lang="ts">
/**
 * Eine Zeile der Erschliessung: Art, Name, Normdaten.
 *
 * Der Abgleich laeuft mit, sobald der Name lang genug ist, traegt aber nichts
 * von selbst ein. Eindeutige Treffer erscheinen als Vorschlag zum Bestaetigen,
 * mehrdeutige als Auswahl mit dem ausdruecklichen Hinweis, dass nichts
 * eingetragen wurde. Kein Treffer ist besser als ein falscher.
 */
import { addSameAs, splitMatches, type UiEntity } from './model'
import type { AuthorityHit, AuthoritySearchResponse, SubjectKind } from './types'

const props = defineProps<{
  entity: UiEntity
  kinds: SubjectKind[]
  /** Feste Art (Genre); dann entfaellt die Auswahl. */
  fixedKind?: boolean
  idPrefix: string
}>()

const emit = defineEmits<{ remove: []; detail: [string, string]; change: [] }>()
const { t } = useI18n()

const hasId = computed(() => props.entity.same_as.length > 0)
const kindLabel = computed(() => {
  const key = `records.editor.authority.kind.${props.entity.kind}`
  return props.entity.kind === 'genre' ? t('records.editor.work.genre') : t(key)
})

let timer: ReturnType<typeof setTimeout> | null = null
let sequence = 0

/** Abgleich im Hintergrund — nur fuer Eintraege, die noch keine Kennung haben. */
async function match() {
  const name = props.entity.has_name.trim()
  if (name.length < 3 || hasId.value) {
    props.entity.suggest = []
    props.entity.ambiguous = []
    return
  }
  const mine = ++sequence
  try {
    const res = await $fetch<AuthoritySearchResponse>('/api/records/authority/search', {
      query: { kind: props.entity.kind, q: name }
    })
    if (mine !== sequence) return
    const split = splitMatches(name, res.results)
    props.entity.suggest = split.confident
    props.entity.ambiguous = split.ambiguous
  } catch {
    // Ein fehlgeschlagener Abgleich ist kein Grund, die Zeile zu stoeren.
    if (mine === sequence) {
      props.entity.suggest = []
      props.entity.ambiguous = []
    }
  }
}

function schedule() {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => void match(), 450)
}

watch(() => props.entity.has_name, () => {
  props.entity.suggest = []
  props.entity.ambiguous = []
  emit('change')
  if (!hasId.value) schedule()
})
watch(() => props.entity.kind, () => {
  emit('change')
  if (!hasId.value) schedule()
})

onMounted(() => {
  if (props.entity.has_name.trim() !== '' && !hasId.value) schedule()
})
onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})

function take(hit: AuthorityHit) {
  addSameAs(props.entity.same_as, hit)
  props.entity.suggest = []
  props.entity.ambiguous = []
  emit('change')
}

function acceptAll() {
  for (const hit of props.entity.suggest) addSameAs(props.entity.same_as, hit)
  props.entity.suggest = []
  props.entity.ambiguous = []
  emit('change')
}

function dismiss() {
  props.entity.suggest = []
  props.entity.ambiguous = []
}

function removeRef(index: number) {
  props.entity.same_as.splice(index, 1)
  emit('change')
}
</script>

<template>
  <div class="ed-entity">
    <select v-if="!fixedKind" class="input kindsel" :value="entity.kind"
            :aria-label="t('records.editor.authority.kindLabel')"
            @change="entity.kind = ($event.target as HTMLSelectElement).value">
      <option v-for="k in kinds" :key="k.kind" :value="k.kind">
        {{ t(`records.editor.authority.kind.${k.kind}`) }}
      </option>
    </select>

    <div class="ed-entity-main">
      <RecordsAuthorityField
        :id="`${idPrefix}-name`"
        v-model="entity.has_name"
        :kind="entity.kind"
        :label="kindLabel"
        :placeholder="t('records.editor.authority.search', { kind: kindLabel })"
        @pick="take" />

      <RecordsSameAsChips :list="entity.same_as" @remove="removeRef" @detail="(s, i) => emit('detail', s, i)" />

      <div v-if="!hasId && entity.suggest.length > 0" class="ed-suggest">
        <span class="ed-suggest-lbl">{{ t('records.editor.authority.suggestion') }}</span>
        <button v-for="hit in entity.suggest" :key="`${hit.source}-${hit.id}`" type="button"
                class="idbadge idbadge-info" :title="hit.description"
                @click="emit('detail', hit.source, hit.id)">
          <span class="idbadge-src" :class="`src-${hit.source}`">{{ hit.source }}</span>
          <span class="idbadge-lab">{{ hit.label }}</span>
          <span class="idbadge-id">{{ hit.id }}</span>
        </button>
        <button type="button" class="btn btn-outline btn-xs" @click="acceptAll">
          {{ t('records.editor.authority.accept') }}
        </button>
        <button type="button" class="linkbtn" :aria-label="t('records.editor.authority.dismiss')"
                @click="dismiss">×</button>
      </div>

      <div v-if="!hasId && entity.suggest.length === 0 && entity.ambiguous.length > 0" class="ed-suggest ambiguous">
        <span class="ed-suggest-lbl warnhint">{{ t('records.editor.authority.ambiguous') }}</span>
        <button v-for="hit in entity.ambiguous" :key="`${hit.source}-${hit.id}`" type="button"
                class="idbadge idbadge-info" :title="t('records.editor.authority.choose')"
                @click="take(hit)">
          <span class="idbadge-src" :class="`src-${hit.source}`">{{ hit.source }}</span>
          <span class="idbadge-lab">{{ hit.label }}</span>
          <span v-if="hit.description" class="idbadge-desc">{{ hit.description }}</span>
          <span class="idbadge-id">{{ hit.id }}</span>
        </button>
        <button type="button" class="linkbtn" :aria-label="t('records.editor.authority.dismiss')"
                @click="dismiss">×</button>
      </div>
    </div>

    <button type="button" class="iconbtn-del" :aria-label="t('records.editor.removeEntry')"
            @click="emit('remove')"><span aria-hidden="true">🗑</span></button>
  </div>
</template>

<style scoped>
.kindsel { max-width: 150px }
.ed-suggest.ambiguous { border-color: var(--warn) }
</style>
