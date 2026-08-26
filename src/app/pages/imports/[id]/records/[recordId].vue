<script setup lang="ts">
/**
 * Der AVefi-Datensatz-Editor.
 *
 * Vertraglich ist die Bearbeitung einzelner Filmdatensaetze nicht geschuldet.
 * Sie ist hier, weil Tester sie bereits benutzt haben — und deshalb an den
 * Stellen sorgfaeltig, an denen sie den Testern begegnet ist.
 *
 * Was hier anders ist als im PHP-Stand:
 *  - Geprueft wird auf dem Server (efi-conv), nicht im Browser nachgebaut.
 *  - Felder, die der Editor nicht anzeigt, bleiben beim Speichern erhalten.
 *  - Ein weiterer Titel wird nie von selbst zum Haupttitel.
 *  - Normdaten haengen als same_as an der Entitaet und ersetzen den Namen nie.
 *  - Leere Wertelisten werden als solche benannt statt als leere Auswahl.
 */
import { apiFailure, failureText } from '~/components/records/errors'
import { formatDateTime } from '~/components/imports/format'
import {
  addSameAs, emptyActivity, emptyEntity, emptyEvent, emptyIdentifier, emptyItem,
  emptyLanguage, emptyManifestation, emptyTitle, emptyValue, nextKey, parseRecord,
  serializeRecord, splitMatches, DEFAULT_ALT_TITLE_TYPE, DEFAULT_PRIMARY_TITLE_TYPE,
  type UiIdentifier, type UiRecord, type UiValue
} from '~/components/records/model'
import type {
  AuthoritySearchResponse, CheckResponse, EditorConfig, RecordDetailResponse, SaveResponse
} from '~/components/records/types'

const route = useRoute()
const router = useRouter()
const { t, te, locale } = useI18n()
const keepFocus = useKeepFocus()

const importId = computed(() => String(route.params.id ?? ''))
const recordId = computed(() => String(route.params.recordId ?? ''))

const { data: config, error: configError } = await useFetch<EditorConfig>('/api/records/config')
const { data: detail, error: detailError } = await useFetch<RecordDetailResponse>(
  () => `/api/imports/${importId.value}/records/${recordId.value}`
)

const loadError = computed(() => {
  const e = detailError.value ?? configError.value
  return e ? failureText(t, te, apiFailure(e)) : ''
})

/* ------------------------------------------------------------- Formularmodell */

const ui = ref<UiRecord | null>(null)
const baseline = ref('')
const tab = ref<'work' | 'manifestations' | 'items'>('work')
const showJson = ref(false)

function build() {
  if (detail.value === null || config.value === null) return
  ui.value = parseRecord(detail.value.avefi, config.value)
  baseline.value = JSON.stringify(serializeRecord(ui.value, config.value))
}
watch([detail, config], build, { immediate: true })

const output = computed(() =>
  ui.value === null || config.value === null ? null : serializeRecord(ui.value, config.value))
const jsonText = computed(() => (output.value === null ? '' : JSON.stringify(output.value, null, 2)))
const dirty = computed(() => output.value !== null && JSON.stringify(output.value) !== baseline.value)

const titleText = computed(() => {
  const name = ui.value?.work.titles[0]?.has_name.trim() ?? ''
  return name !== '' ? name : t('records.editor.untitled')
})

useHead({ title: () => t('records.editor.pageTitle', { title: titleText.value }) })

function enums(name: string): string[] {
  return config.value?.enums[name] ?? []
}

const subjectKinds = computed(() => config.value?.subjectKinds ?? [])
const activityCategories = computed(() => config.value?.activityCategories ?? [])
const eventCategories = computed(() => config.value?.eventCategories ?? [])
const resourceTypes = computed(() => Object.keys(config.value?.resourceTypes ?? {}))

/* ------------------------------------------------------------------- Pruefung */

const completeness = ref(0)
const ring = ref('')
const editedAt = ref<string | null>(null)
const check = ref<CheckResponse | null>(null)
const checking = ref(false)
const saving = ref(false)
const saved = ref(false)
const actionError = ref('')

watch(detail, (d) => {
  if (d === null) return
  completeness.value = d.record.completeness
  ring.value = d.record.ring
  editedAt.value = d.record.editedAt
  check.value = null
}, { immediate: true })

async function runCheck() {
  if (output.value === null || checking.value) return
  return keepFocus(() => runCheckInner())
}

async function runCheckInner() {
  checking.value = true
  actionError.value = ''
  try {
    // Der Ring zeigt weiter den gespeicherten Wert: Sonst spraenge er beim
    // Tippen und wuerde etwas versprechen, was noch nirgends steht.
    check.value = await $fetch<CheckResponse>('/api/records/validate', {
      method: 'POST',
      body: output.value
    })
  } catch (e) {
    actionError.value = failureText(t, te, apiFailure(e))
  } finally {
    checking.value = false
  }
}

async function save() {
  if (output.value === null || saving.value) return
  return keepFocus(() => saveInner())
}

async function saveInner() {
  saving.value = true
  saved.value = false
  actionError.value = ''
  try {
    const res = await $fetch<SaveResponse>(`/api/imports/${importId.value}/records/${recordId.value}`, {
      method: 'PUT',
      body: output.value
    })
    completeness.value = res.completeness
    ring.value = res.ring
    editedAt.value = res.editedAt
    check.value = res
    baseline.value = JSON.stringify(output.value)
    saved.value = true
  } catch (e) {
    actionError.value = failureText(t, te, apiFailure(e))
  } finally {
    saving.value = false
  }
}

const issues = computed(() => check.value?.issues ?? [])
const hints = computed(() => (check.value?.hints ?? detail.value?.hints ?? []).filter((h) => h.level !== 'ok'))

/* --------------------------------------------------- Ungespeicherte Aenderungen */

function beforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void runCheck()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm(t('records.editor.leave'))
})

/* -------------------------------------------------------------- Normdaten-Detail */

const detailRef = ref<{ source: string; id: string } | null>(null)
function openDetail(source: string, id: string) {
  detailRef.value = { source, id }
}

/* -------------------------------------------------------------- Titelverwaltung */

function addTitle() {
  ui.value?.work.titles.push(emptyTitle(DEFAULT_ALT_TITLE_TYPE))
}
function removeTitle(index: number) {
  // Der Haupttitel wird geleert, nicht entfernt: Position 0 ist der Haupttitel.
  if (index === 0) {
    const first = ui.value?.work.titles[0]
    if (first !== undefined) first.has_name = ''
    return
  }
  ui.value?.work.titles.splice(index, 1)
}
/**
 * Nur diese ausdrueckliche Handlung macht einen weiteren Titel zum Haupttitel.
 * Im PHP-Stand landeten Titelvorschlaege alle auf dem Haupttitel — gemeldeter Fehler.
 */
function makePrimary(index: number) {
  const titles = ui.value?.work.titles
  if (titles === undefined || index < 1) return
  const chosen = titles[index]
  const primary = titles[0]
  if (chosen === undefined || primary === undefined) return
  titles[0] = chosen
  titles[index] = primary
  if (chosen.type === DEFAULT_ALT_TITLE_TYPE) chosen.type = DEFAULT_PRIMARY_TITLE_TYPE
  if (primary.type === DEFAULT_PRIMARY_TITLE_TYPE) primary.type = DEFAULT_ALT_TITLE_TYPE
}

/* ------------------------------------------------------------- Sammelabgleich */

const matching = ref(false)
const matchMessage = ref('')

async function matchAll() {
  return keepFocus(() => matchAllInner())
}

async function matchAllInner() {
  const work = ui.value?.work
  if (work === undefined || matching.value) return
  const open = work.subjects.filter((s) => s.has_name.trim().length >= 3 && s.same_as.length === 0)
  if (open.length === 0) {
    matchMessage.value = t('records.editor.work.matchNone')
    return
  }
  matching.value = true
  matchMessage.value = ''
  let hit = 0
  await Promise.all(open.map(async (entity) => {
    const name = entity.has_name.trim()
    try {
      const res = await $fetch<AuthoritySearchResponse>('/api/records/authority/search', {
        query: { kind: entity.kind, q: name }
      })
      const split = splitMatches(name, res.results)
      if (split.confident.length > 0) {
        for (const found of split.confident) addSameAs(entity.same_as, found)
        entity.suggest = []
        entity.ambiguous = []
        hit++
      } else {
        // Mehrdeutig heisst: nichts eintragen, aber zur Auswahl stellen.
        entity.ambiguous = split.ambiguous
      }
    } catch {
      /* Eine Quelle, die nicht antwortet, blockiert den Rest nicht. */
    }
  }))
  matching.value = false
  matchMessage.value = t('records.editor.work.matchResult', { hit, total: open.length })
}

/* --------------------------------------------------------------- Kleinkram */

function removeAt<T>(list: T[], index: number) {
  list.splice(index, 1)
}
function addIdentifier(list: UiIdentifier[]) {
  list.push(emptyIdentifier())
}
function addValue(list: UiValue[]) {
  list.push(emptyValue())
}

const tabs = ['work', 'manifestations', 'items'] as const
function onTabKey(e: KeyboardEvent, index: number) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  e.preventDefault()
  const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
  tab.value = tabs[next]!
  nextTick(() => document.getElementById(`tab-${tabs[next]}`)?.focus())
}

const pidOpen = ref(false)

function backToList() {
  void router.push(`/imports/${importId.value}/records`)
}
</script>

<template>
  <main id="main" class="appwrap">
    <nav class="crumbs" :aria-label="t('records.editor.crumb')">
      <NuxtLink to="/">{{ t('imports.heading') }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <NuxtLink :to="`/imports/${importId}`">{{ detail?.import.filename ?? importId }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <NuxtLink :to="`/imports/${importId}/records`">{{ t('records.crumb') }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <span>{{ titleText }}</span>
    </nav>

    <div v-if="loadError !== ''" class="alert" role="alert">
      {{ loadError }}
      <p style="margin:8px 0 0">
        <NuxtLink class="btn btn-outline btn-sm" :to="`/imports/${importId}/records`">
          {{ t('records.editor.backToList') }}
        </NuxtLink>
      </p>
    </div>

    <template v-else-if="ui !== null && detail !== null && config !== null">
      <div class="editbar">
        <h1 class="ed-title">{{ titleText }}</h1>
        <div class="bigring ed-ring" :class="ring" :style="{ '--p': completeness }" role="img"
             :aria-label="t('records.editor.ring', { percent: completeness })">
          <span aria-hidden="true"><b class="tnum">{{ completeness }}%</b></span>
        </div>
        <div class="ed-actions">
          <NuxtLink v-if="detail.prev !== null" class="btn btn-outline btn-sm"
                    :to="`/imports/${importId}/records/${detail.prev}`">← {{ t('records.editor.prev') }}</NuxtLink>
          <NuxtLink v-if="detail.next !== null" class="btn btn-outline btn-sm"
                    :to="`/imports/${importId}/records/${detail.next}`">{{ t('records.editor.next') }} →</NuxtLink>
          <button type="button" class="btn btn-outline btn-sm" :aria-expanded="showJson"
                  aria-controls="record-json" @click="showJson = !showJson">
            <span aria-hidden="true">{ }</span> {{ t('records.editor.json') }}
          </button>
          <button type="button" class="btn btn-outline btn-sm" @click="pidOpen = true">
            <span aria-hidden="true">🔗</span> {{ t('records.editor.pid') }}
          </button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
            {{ saving ? t('records.editor.saving') : t('records.editor.save') }}
          </button>
        </div>
      </div>

      <p class="dim small" style="margin:-8px 0 12px">
        <span v-if="detail.record.sourceRow !== null">
          {{ t('records.editor.sourceRow', { row: detail.record.sourceRow }) }}
        </span>
        <span v-if="editedAt"> · {{ t('records.editor.editedAt', { when: formatDateTime(editedAt, locale) }) }}</span>
      </p>

      <div v-if="config.schemaError" class="alert" role="alert" style="margin-bottom:12px">
        {{ t('records.editor.schemaMissing', { reason: config.schemaError }) }}
      </div>

      <div v-if="actionError !== ''" class="alert" role="alert" style="margin-bottom:12px">{{ actionError }}</div>
      <div v-if="saved" class="alert-ok" role="status" style="margin-bottom:12px">{{ t('records.editor.saved') }}</div>
      <div v-else-if="dirty" class="dim small" role="status" style="margin-bottom:12px">
        {{ t('records.editor.unsaved') }}
      </div>

      <!-- Pruefung -->
      <section class="card" style="margin-bottom:16px" aria-labelledby="check-heading">
        <div class="ed-card-head">
          <h2 id="check-heading" class="side-h" style="margin:0">{{ t('records.editor.check.heading') }}</h2>
          <button type="button" class="btn btn-outline btn-sm" :disabled="checking" @click="runCheck">
            {{ checking ? t('records.editor.check.running') : t('records.editor.check.run') }}
          </button>
        </div>
        <p class="note" style="margin-top:0">{{ t('records.editor.check.explain') }}</p>

        <div aria-live="polite">
          <p v-if="check === null" class="dim small">{{ t('records.editor.check.never') }}</p>
          <div v-else-if="check.unavailable !== null" class="alert" role="alert" style="margin:0">
            {{ t('records.editor.check.unavailable', { reason: check.unavailable }) }}
          </div>
          <div v-else-if="issues.length === 0" class="alert-ok" style="margin:0">
            <span aria-hidden="true">✓</span> {{ t('records.editor.check.ok') }}
          </div>
          <div v-else class="alert" style="margin:0">
            <b>{{ t('records.editor.check.errors', { count: issues.length }, issues.length) }}</b>
            — {{ t('records.editor.check.saveAnyway') }}
            <ul class="ed-errs">
              <li v-for="(issue, i) in issues" :key="i">
                <span v-if="issue.targetField" class="mono small">{{ issue.targetField }}: </span>{{ issue.message }}
                <span v-if="issue.value" class="dim small"> („{{ issue.value }}“)</span>
              </li>
            </ul>
          </div>
        </div>

        <div style="margin-top:12px">
          <h3 class="side-h" style="margin-bottom:4px">{{ t('records.editor.check.hintsHeading') }}</h3>
          <p class="note" style="margin-top:0">{{ t('records.editor.check.hintsExplain') }}</p>
          <p v-if="hints.length === 0" class="okval">{{ t('records.editor.check.hintsOk') }}</p>
          <ul v-else class="ed-errs">
            <li v-for="(hint, i) in hints" :key="i">{{ hint.text }}</li>
          </ul>
        </div>
      </section>

      <!-- Der Kasten rollt und enthaelt kein Bedienelement: ohne tabindex kaeme
           man mit der Tastatur nicht an den unteren Teil des JSON. -->
      <pre v-if="showJson" id="record-json" class="jsonprev" tabindex="0" role="region"
           :aria-label="t('records.editor.jsonLabel')">{{ jsonText }}</pre>
      <p v-if="showJson" class="note">{{ t('records.editor.jsonHint') }}</p>

      <!-- Reiter -->
      <div class="ed-tabs" role="tablist" :aria-label="t('records.crumb')">
        <button v-for="(name, i) in tabs" :id="`tab-${name}`" :key="name" type="button" role="tab"
                :class="{ on: tab === name }" :aria-selected="tab === name"
                :aria-controls="`panel-${name}`" :tabindex="tab === name ? 0 : -1"
                @click="tab = name" @keydown="onTabKey($event, i)">
          <template v-if="name === 'work'">{{ t('records.editor.tabs.work') }}</template>
          <template v-else-if="name === 'manifestations'">
            {{ t('records.editor.tabs.manifestations', { count: ui.manifestations.length }) }}
          </template>
          <template v-else>{{ t('records.editor.tabs.items', { count: ui.items.length }) }}</template>
        </button>
      </div>

      <!-- WERK -->
      <section v-show="tab === 'work'" id="panel-work" class="ed-tabpanel" role="tabpanel"
               aria-labelledby="tab-work" tabindex="0">
        <div class="ed-card">
          <h2>{{ t('records.editor.work.basics') }}</h2>
          <div class="ed-grid2">
            <div class="ed-f">
              <label for="w-type">{{ t('records.editor.work.type') }}</label>
              <RecordsEnumSelect id="w-type" v-model="ui.work.type" :values="enums('WorkVariantTypeEnum')" />
            </div>
            <div class="ed-f">
              <label for="w-variant">{{ t('records.editor.work.variantType') }}</label>
              <RecordsEnumSelect id="w-variant" v-model="ui.work.variant_type" :values="enums('VariantTypeEnum')" />
            </div>
            <div class="ed-f">
              <label for="w-year">{{ t('records.editor.work.productionYear') }}</label>
              <input id="w-year" v-model="ui.work.productionYear" class="input" type="text"
                     aria-describedby="w-year-hint">
              <span id="w-year-hint" class="note">{{ t('records.editor.work.productionYearHint') }}</span>
            </div>
          </div>

          <div class="ed-sub">
            <span class="ed-sublabel">{{ t('records.editor.work.productionPlace') }}</span>
            <div v-for="(place, i) in ui.work.productionPlaces" :key="place.key" class="ed-title-row">
              <input v-model="place.has_name" class="input" type="text"
                     :aria-label="t('records.editor.work.productionPlace')">
              <button type="button" class="iconbtn-del"
                      :aria-label="t('records.editor.work.removeProductionPlace')"
                      @click="removeAt(ui.work.productionPlaces, i)"><span aria-hidden="true">🗑</span></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm"
                    @click="ui.work.productionPlaces.push({ key: nextKey(), has_name: '', raw: {} })">
              + {{ t('records.editor.work.addProductionPlace') }}
            </button>
          </div>
        </div>

        <div class="ed-card">
          <h2>{{ t('records.editor.work.titles') }}</h2>
          <div v-for="(title, i) in ui.work.titles" :key="title.key" class="ed-title-row">
            <input :id="`title-${title.key}`" v-model="title.has_name" class="input" type="text"
                   :aria-label="i === 0 ? t('records.editor.work.primaryTitle') : t('records.editor.work.altTitle')"
                   :placeholder="i === 0 ? t('records.editor.work.primaryTitle') : t('records.editor.work.altTitle')">
            <RecordsEnumSelect :id="`title-type-${title.key}`" v-model="title.type" :values="enums('TitleTypeEnum')"
                               :label="t('records.editor.work.titleType')" />
            <span v-if="i === 0" class="ed-primary-badge">{{ t('records.editor.work.primaryBadge') }}</span>
            <button v-else type="button" class="btn btn-outline btn-xs"
                    :title="t('records.editor.work.makePrimaryHint')" @click="makePrimary(i)">
              {{ t('records.editor.work.makePrimary') }}
            </button>
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeTitle')"
                    @click="removeTitle(i)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addTitle">
            + {{ t('records.editor.work.addTitle') }}
          </button>
        </div>

        <div class="ed-card">
          <div class="ed-card-head">
            <h2>{{ t('records.editor.work.subjects') }}</h2>
            <button type="button" class="btn btn-outline btn-sm" :disabled="matching" @click="matchAll">
              {{ matching ? t('records.editor.work.matching') : t('records.editor.work.matchAll') }}
            </button>
          </div>
          <p class="note" style="margin-top:0">{{ t('records.editor.work.subjectsHint') }}</p>
          <p v-if="matchMessage !== ''" class="okval" role="status">{{ matchMessage }}</p>
          <RecordsEntityRow v-for="(entity, i) in ui.work.subjects" :key="entity.key" :entity="entity"
                            :kinds="subjectKinds" :id-prefix="`subject-${entity.key}`"
                            @remove="removeAt(ui.work.subjects, i)" @detail="openDetail" />
          <button type="button" class="btn btn-outline btn-sm" @click="ui.work.subjects.push(emptyEntity('subject'))">
            + {{ t('records.editor.work.addSubject') }}
          </button>
        </div>

        <div class="ed-card">
          <h2>{{ t('records.editor.work.activities') }}</h2>
          <p class="note" style="margin-top:0">{{ t('records.editor.work.activitiesHint') }}</p>
          <RecordsActivityRow v-for="(act, i) in ui.work.activities" :key="act.key" :act="act"
                              :categories="activityCategories" :config="config" :id-prefix="`act-${act.key}`"
                              @remove="removeAt(ui.work.activities, i)" @detail="openDetail" />
          <button type="button" class="btn btn-outline btn-sm"
                  @click="ui.work.activities.push(emptyActivity('avefi:DirectingActivity'))">
            + {{ t('records.editor.work.addActivity') }}
          </button>
        </div>

        <div class="ed-card">
          <h2>{{ t('records.editor.work.events') }}</h2>
          <div v-for="(event, i) in ui.work.events" :key="event.key" class="ed-title-row">
            <select v-model="event.category" class="input" :aria-label="t('records.editor.work.eventCategory')">
              <option v-for="c in eventCategories" :key="c.category" :value="c.category">
                {{ t(`records.editor.event.${c.category}`) }}
              </option>
            </select>
            <RecordsEnumSelect :id="`event-type-${event.key}`" v-model="event.type"
                               :values="enums(eventCategories.find((c) => c.category === event.category)?.enumName ?? '')"
                               :label="t('records.editor.work.eventType')"
                               :placeholder="t('records.editor.work.eventType')" />
            <input v-model="event.has_date" class="input" type="text"
                   :aria-label="t('records.editor.work.eventDate')"
                   :placeholder="t('records.editor.work.eventDate')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeEvent')"
                    @click="removeAt(ui.work.events, i)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm"
                  @click="ui.work.events.push(emptyEvent('avefi:PublicationEvent'))">
            + {{ t('records.editor.work.addEvent') }}
          </button>
        </div>

        <div class="ed-card">
          <h2>{{ t('records.editor.work.genres') }}</h2>
          <RecordsEntityRow v-for="(genre, i) in ui.work.genres" :key="genre.key" :entity="genre"
                            :kinds="subjectKinds" fixed-kind :id-prefix="`genre-${genre.key}`"
                            @remove="removeAt(ui.work.genres, i)" @detail="openDetail" />
          <button type="button" class="btn btn-outline btn-sm" @click="ui.work.genres.push(emptyEntity('genre'))">
            + {{ t('records.editor.work.addGenre') }}
          </button>

          <div class="ed-forms">
            <div v-for="(form, i) in ui.work.forms" :key="form.key" class="ed-title-row">
              <RecordsEnumSelect :id="`form-${form.key}`" v-model="form.value" :values="enums('WorkFormEnum')"
                                 :label="t('records.editor.work.form')"
                                 :placeholder="t('records.editor.work.form')" />
              <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeForm')"
                      @click="removeAt(ui.work.forms, i)"><span aria-hidden="true">🗑</span></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="addValue(ui.work.forms)">
              + {{ t('records.editor.work.addForm') }}
            </button>
          </div>
        </div>

        <div class="ed-card">
          <h2>{{ t('records.editor.work.identifiers') }}</h2>
          <div v-for="(id, i) in ui.work.identifiers" :key="id.key" class="ed-title-row">
            <select v-model="id.resourceType" class="input" :aria-label="t('records.editor.work.identifierType')">
              <option v-for="name in resourceTypes" :key="name" :value="name">
                {{ te(`records.editor.resource.${name}`) ? t(`records.editor.resource.${name}`) : name }}
              </option>
            </select>
            <input v-model="id.id" class="input" type="text" :aria-label="t('records.editor.work.identifier')"
                   :placeholder="t('records.editor.work.identifier')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeIdentifier')"
                    @click="removeAt(ui.work.identifiers, i)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(ui.work.identifiers)">
            + {{ t('records.editor.work.addIdentifier') }}
          </button>

          <div class="ed-forms">
            <div v-for="(note, i) in ui.work.notes" :key="note.key" class="ed-title-row">
              <input v-model="note.value" class="input" type="text" :aria-label="t('records.editor.work.note')"
                     :placeholder="t('records.editor.work.note')">
              <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeNote')"
                      @click="removeAt(ui.work.notes, i)"><span aria-hidden="true">🗑</span></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="addValue(ui.work.notes)">
              + {{ t('records.editor.work.addNote') }}
            </button>
          </div>
        </div>
      </section>

      <!-- FASSUNGEN -->
      <section v-show="tab === 'manifestations'" id="panel-manifestations" class="ed-tabpanel" role="tabpanel"
               aria-labelledby="tab-manifestations" tabindex="0">
        <p v-if="ui.manifestations.length === 0" class="dim">{{ t('records.editor.manifestation.empty') }}</p>
        <div v-for="(m, i) in ui.manifestations" :key="m.key" class="ed-card">
          <div class="ed-card-head">
            <h2>{{ t('records.editor.manifestation.heading', { index: i + 1 }) }}</h2>
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.manifestation.remove')"
                    @click="removeAt(ui.manifestations, i)"><span aria-hidden="true">🗑</span></button>
          </div>
          <div class="ed-title-row">
            <input v-model="m.title.has_name" class="input" type="text"
                   :aria-label="t('records.editor.manifestation.title')"
                   :placeholder="t('records.editor.manifestation.title')">
            <RecordsEnumSelect :id="`m-title-type-${m.key}`" v-model="m.title.type" :values="enums('TitleTypeEnum')"
                               :label="t('records.editor.work.titleType')" />
          </div>
          <div v-for="(id, j) in m.identifiers" :key="id.key" class="ed-title-row">
            <select v-model="id.resourceType" class="input" :aria-label="t('records.editor.work.identifierType')">
              <option v-for="name in resourceTypes" :key="name" :value="name">
                {{ te(`records.editor.resource.${name}`) ? t(`records.editor.resource.${name}`) : name }}
              </option>
            </select>
            <input v-model="id.id" class="input" type="text" :aria-label="t('records.editor.work.identifier')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeIdentifier')"
                    @click="removeAt(m.identifiers, j)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(m.identifiers)">
            + {{ t('records.editor.work.addIdentifier') }}
          </button>
          <div v-for="(note, j) in m.notes" :key="note.key" class="ed-title-row" style="margin-top:8px">
            <input v-model="note.value" class="input" type="text" :aria-label="t('records.editor.work.note')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeNote')"
                    @click="removeAt(m.notes, j)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addValue(m.notes)">
            + {{ t('records.editor.work.addNote') }}
          </button>
          <p class="note">{{ t('records.editor.manifestation.kept') }}</p>
        </div>
        <button type="button" class="btn btn-outline"
                @click="ui.manifestations.push(emptyManifestation(ui.work.titles[0]?.has_name ?? ''))">
          + {{ t('records.editor.manifestation.add') }}
        </button>
      </section>

      <!-- EXEMPLARE -->
      <section v-show="tab === 'items'" id="panel-items" class="ed-tabpanel" role="tabpanel"
               aria-labelledby="tab-items" tabindex="0">
        <p v-if="ui.items.length === 0" class="dim">{{ t('records.editor.item.empty') }}</p>
        <div v-for="(it, i) in ui.items" :key="it.key" class="ed-card">
          <div class="ed-card-head">
            <h2>{{ t('records.editor.item.heading', { index: i + 1 }) }}</h2>
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.item.remove')"
                    @click="removeAt(ui.items, i)"><span aria-hidden="true">🗑</span></button>
          </div>
          <div class="ed-title-row">
            <input v-model="it.title.has_name" class="input" type="text"
                   :aria-label="t('records.editor.item.title')" :placeholder="t('records.editor.item.title')">
            <RecordsEnumSelect :id="`i-title-type-${it.key}`" v-model="it.title.type" :values="enums('TitleTypeEnum')"
                               :label="t('records.editor.work.titleType')" />
          </div>
          <div class="ed-grid2">
            <div class="ed-f">
              <label :for="`i-element-${it.key}`">{{ t('records.editor.item.elementType') }}</label>
              <RecordsEnumSelect :id="`i-element-${it.key}`" v-model="it.element_type"
                                 :values="enums('ItemElementTypeEnum')" />
            </div>
            <div class="ed-f">
              <label :for="`i-colour-${it.key}`">{{ t('records.editor.item.colour') }}</label>
              <RecordsEnumSelect :id="`i-colour-${it.key}`" v-model="it.has_colour_type"
                                 :values="enums('ColourTypeEnum')" />
            </div>
            <div class="ed-f">
              <label :for="`i-sound-${it.key}`">{{ t('records.editor.item.sound') }}</label>
              <RecordsEnumSelect :id="`i-sound-${it.key}`" v-model="it.has_sound_type"
                                 :values="enums('SoundTypeEnum')" />
            </div>
            <div class="ed-f">
              <label :for="`i-frame-${it.key}`">{{ t('records.editor.item.frameRate') }}</label>
              <RecordsEnumSelect :id="`i-frame-${it.key}`" v-model="it.has_frame_rate"
                                 :values="enums('FrameRateEnum')" />
            </div>
            <div class="ed-f">
              <label :for="`i-access-${it.key}`">{{ t('records.editor.item.access') }}</label>
              <RecordsEnumSelect :id="`i-access-${it.key}`" v-model="it.has_access_status"
                                 :values="enums('ItemAccessStatusEnum')" />
            </div>
            <div class="ed-f">
              <label :for="`i-duration-${it.key}`">{{ t('records.editor.item.duration') }}</label>
              <input :id="`i-duration-${it.key}`" v-model="it.duration" class="input" type="text"
                     :aria-describedby="`i-duration-hint-${it.key}`" placeholder="PT01H30M00S">
              <span :id="`i-duration-hint-${it.key}`" class="note">{{ t('records.editor.item.durationHint') }}</span>
            </div>
          </div>

          <div class="ed-sub">
            <span class="ed-sublabel">{{ t('records.editor.item.languages') }}</span>
            <div v-for="(lang, j) in it.languages" :key="lang.key" class="ed-title-row">
              <RecordsEnumSelect :id="`i-lang-${lang.key}`" v-model="lang.code" :values="enums('LanguageCodeEnum')"
                                 :label="t('records.editor.item.language')"
                                 :placeholder="t('records.editor.item.language')" />
              <RecordsEnumSelect :id="`i-langusage-${lang.key}`" v-model="lang.usage"
                                 :values="enums('LanguageUsageEnum')"
                                 :label="t('records.editor.item.languageUsage')"
                                 :placeholder="t('records.editor.item.languageUsage')" />
              <button type="button" class="iconbtn-del" :aria-label="t('records.editor.item.removeLanguage')"
                      @click="removeAt(it.languages, j)"><span aria-hidden="true">🗑</span></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="it.languages.push(emptyLanguage())">
              + {{ t('records.editor.item.addLanguage') }}
            </button>
          </div>

          <div v-for="(id, j) in it.identifiers" :key="id.key" class="ed-title-row">
            <select v-model="id.resourceType" class="input" :aria-label="t('records.editor.work.identifierType')">
              <option v-for="name in resourceTypes" :key="name" :value="name">
                {{ te(`records.editor.resource.${name}`) ? t(`records.editor.resource.${name}`) : name }}
              </option>
            </select>
            <input v-model="id.id" class="input" type="text" :aria-label="t('records.editor.work.identifier')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeIdentifier')"
                    @click="removeAt(it.identifiers, j)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(it.identifiers)">
            + {{ t('records.editor.work.addIdentifier') }}
          </button>

          <div v-for="(note, j) in it.notes" :key="note.key" class="ed-title-row" style="margin-top:8px">
            <input v-model="note.value" class="input" type="text" :aria-label="t('records.editor.work.note')">
            <button type="button" class="iconbtn-del" :aria-label="t('records.editor.work.removeNote')"
                    @click="removeAt(it.notes, j)"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addValue(it.notes)">
            + {{ t('records.editor.work.addNote') }}
          </button>
        </div>
        <button type="button" class="btn btn-outline"
                @click="ui.items.push(emptyItem(ui.work.titles[0]?.has_name ?? ''))">
          + {{ t('records.editor.item.add') }}
        </button>
      </section>

      <p style="margin-top:18px">
        <button type="button" class="btn btn-outline btn-sm" @click="backToList">
          ← {{ t('records.editor.backToList') }}
        </button>
      </p>

      <RecordsAuthorityDetail v-if="detailRef !== null" :source="detailRef.source" :id="detailRef.id"
                              @close="detailRef = null" />

      <ImportsConfirmDialog :open="pidOpen" :title="t('records.editor.pidTitle')" :message="t('records.editor.pidText')"
                            :ok-text="t('records.editor.close')" @confirm="pidOpen = false" @cancel="pidOpen = false" />
    </template>

    <p v-else class="dim">{{ t('records.editor.loading') }}</p>
  </main>
</template>
