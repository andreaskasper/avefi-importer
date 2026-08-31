<script setup lang="ts">
/**
 * Ein Exemplar im Datensatz-Editor.
 *
 * Herausgeloest, damit die Karte dort stehen kann, wo sie hingehoert: unter
 * ihrer Fassung. Solange Werk, Fassung und Exemplar drei gleichrangige Reiter
 * waren, sah die Oberflaeche aus, als seien es drei unabhaengige Dinge — dabei
 * gehoert jedes Exemplar zu genau einer Fassung. Die Komponente kennt weder
 * Seitenaufbau noch Reiter; sie bekommt ein Exemplar und meldet, was der
 * Benutzer will.
 */
import { emptyIdentifier, emptyLanguage, emptyValue, type UiIdentifier, type UiItem, type UiValue } from './model'

const props = defineProps<{
  item: UiItem
  /** Laufende Nummer fuer Ueberschrift und zugaengliche Namen. */
  index: number
  /** Ueberschrift der Karte — sie nennt die Fassung mit, zu der das Exemplar gehoert. */
  heading: string
  enums: (name: string) => string[]
  resourceTypes: string[]
}>()

const emit = defineEmits<{ remove: [] }>()
const { t, te } = useI18n()

/**
 * Zugaenglicher Name mit der Ebene davor. Kennungen und Notizen gibt es auf
 * mehreren Ebenen; ohne den Bezug hiesse jeder dieser Knoepfe gleich.
 */
function scoped(text: string): string {
  return t('records.editor.aria.inScope', { scope: props.heading, text })
}

function removeAt<T>(list: T[], index: number) {
  list.splice(index, 1)
}
function addIdentifier(list: UiIdentifier[]) {
  list.push(emptyIdentifier())
}
function addValue(list: UiValue[]) {
  list.push(emptyValue())
}
</script>

<template>
  <div class="ed-card ed-item">
    <div class="ed-card-head">
      <h3>{{ heading }}</h3>
      <button type="button" class="iconbtn-del"
              :aria-label="t('records.editor.item.remove', { index: index + 1 })"
              @click="emit('remove')"><span aria-hidden="true">🗑</span></button>
    </div>
    <div class="ed-title-row">
      <input v-model="item.title.has_name" class="input" type="text"
             :aria-label="t('records.editor.item.title')" :placeholder="t('records.editor.item.title')">
      <RecordsEnumSelect :id="`it-title-type-${item.key}`" v-model="item.title.type" :values="enums('TitleTypeEnum')"
                         :label="t('records.editor.work.titleType')" />
    </div>
    <div class="ed-grid2">
      <div class="ed-f">
        <label :for="`it-element-${item.key}`">{{ t('records.editor.item.elementType') }}</label>
        <RecordsEnumSelect :id="`it-element-${item.key}`" v-model="item.element_type"
                           :values="enums('ItemElementTypeEnum')" />
      </div>
      <div class="ed-f">
        <label :for="`it-colour-${item.key}`">{{ t('records.editor.item.colour') }}</label>
        <RecordsEnumSelect :id="`it-colour-${item.key}`" v-model="item.has_colour_type"
                           :values="enums('ColourTypeEnum')" />
      </div>
      <div class="ed-f">
        <label :for="`it-sound-${item.key}`">{{ t('records.editor.item.sound') }}</label>
        <RecordsEnumSelect :id="`it-sound-${item.key}`" v-model="item.has_sound_type"
                           :values="enums('SoundTypeEnum')" />
      </div>
      <div class="ed-f">
        <label :for="`it-frame-${item.key}`">{{ t('records.editor.item.frameRate') }}</label>
        <RecordsEnumSelect :id="`it-frame-${item.key}`" v-model="item.has_frame_rate"
                           :values="enums('FrameRateEnum')" />
      </div>
      <div class="ed-f">
        <label :for="`it-access-${item.key}`">{{ t('records.editor.item.access') }}</label>
        <RecordsEnumSelect :id="`it-access-${item.key}`" v-model="item.has_access_status"
                           :values="enums('ItemAccessStatusEnum')" />
      </div>
      <div class="ed-f">
        <label :for="`it-duration-${item.key}`">{{ t('records.editor.item.duration') }}</label>
        <input :id="`it-duration-${item.key}`" v-model="item.duration" class="input" type="text"
               :aria-describedby="`it-duration-hint-${item.key}`" placeholder="PT01H30M00S">
        <span :id="`it-duration-hint-${item.key}`" class="note">{{ t('records.editor.item.durationHint') }}</span>
      </div>
    </div>

    <div class="ed-sub">
      <span class="ed-sublabel">{{ t('records.editor.item.languages') }}</span>
      <div v-for="(lang, j) in item.languages" :key="lang.key" class="ed-title-row">
        <RecordsEnumSelect :id="`it-lang-${lang.key}`" v-model="lang.code" :values="enums('LanguageCodeEnum')"
                           :label="t('records.editor.item.language')"
                           :placeholder="t('records.editor.item.language')" />
        <RecordsEnumSelect :id="`it-langusage-${lang.key}`" v-model="lang.usage"
                           :values="enums('LanguageUsageEnum')"
                           :label="t('records.editor.item.languageUsage')"
                           :placeholder="t('records.editor.item.languageUsage')" />
        <button type="button" class="iconbtn-del"
                :aria-label="scoped(t('records.editor.item.removeLanguage', { index: j + 1 }))"
                @click="removeAt(item.languages, j)"><span aria-hidden="true">🗑</span></button>
      </div>
      <button type="button" class="btn btn-outline btn-sm"
              :aria-label="scoped(t('records.editor.item.addLanguage'))"
              @click="item.languages.push(emptyLanguage())">
        <span aria-hidden="true">+</span> {{ t('records.editor.item.addLanguage') }}
      </button>
    </div>

    <div v-for="(id, j) in item.identifiers" :key="id.key" class="ed-title-row">
      <select v-model="id.resourceType" class="input" :aria-label="t('records.editor.work.identifierType')">
        <option v-for="name in resourceTypes" :key="name" :value="name">
          {{ te(`records.editor.resource.${name}`) ? t(`records.editor.resource.${name}`) : name }}
        </option>
      </select>
      <input v-model="id.id" class="input" type="text" :aria-label="t('records.editor.work.identifier')">
      <button type="button" class="iconbtn-del"
              :aria-label="scoped(t('records.editor.work.removeIdentifier', { index: j + 1 }))"
              @click="removeAt(item.identifiers, j)"><span aria-hidden="true">🗑</span></button>
    </div>
    <button type="button" class="btn btn-outline btn-sm"
            :aria-label="scoped(t('records.editor.work.addIdentifier'))"
            @click="addIdentifier(item.identifiers)">
      <span aria-hidden="true">+</span> {{ t('records.editor.work.addIdentifier') }}
    </button>

    <div v-for="(note, j) in item.notes" :key="note.key" class="ed-title-row" style="margin-top:8px">
      <input v-model="note.value" class="input" type="text" :aria-label="t('records.editor.work.note')">
      <button type="button" class="iconbtn-del"
              :aria-label="scoped(t('records.editor.work.removeNote', { index: j + 1 }))"
              @click="removeAt(item.notes, j)"><span aria-hidden="true">🗑</span></button>
    </div>
    <button type="button" class="btn btn-outline btn-sm"
            :aria-label="scoped(t('records.editor.work.addNote'))"
            @click="addValue(item.notes)">
      <span aria-hidden="true">+</span> {{ t('records.editor.work.addNote') }}
    </button>
  </div>
</template>
