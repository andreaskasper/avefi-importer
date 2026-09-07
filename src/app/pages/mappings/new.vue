<script setup lang="ts">
import { mappingsService } from '~/services/mappings'
/**
 * Neues Mappingprofil aus einer Beispieldatei.
 *
 * Die Datei wird nur gelesen, nicht gespeichert. Abgelegt werden Spaltennamen
 * und einige Beispielzeilen — genug fuer eine echte Vorschau, und der Grund,
 * warum sich ein Profil spaeter ohne die Datei bearbeiten laesst.
 *
 * Ist die Kopfzeile schon bekannt, entsteht kein zweites Profil: Der Weg fuehrt
 * zum vorhandenen, dessen Stichprobe dabei aufgefrischt wird.
 */
import { failureText, mappingFailure, type MappingFailure } from '~/components/mapping/errors'

const zuordnungen = mappingsService()

const { t, te } = useI18n()
useHead({ title: () => t('mapping.new.title') })

const file = ref<File | null>(null)
const busy = ref(false)
const failure = ref<MappingFailure | null>(null)
const dragover = ref(false)
const errorText = computed(() => failureText(t, te, failure.value))
const input = ref<HTMLInputElement | null>(null)

/**
 * Ein Klick auf die freie Flaeche oeffnet die Dateiauswahl. Klicks auf das
 * Label oder das Feld selbst bleiben unberuehrt, sonst ginge der Dialog
 * zweimal auf.
 */
function onZoneClick(e: MouseEvent) {
  const ziel = e.target as HTMLElement | null
  if (ziel?.closest('label, button, input, a')) return
  input.value?.click()
}

function pick(event: Event) {
  const list = (event.target as HTMLInputElement).files
  file.value = list !== null && list.length > 0 ? list[0]! : null
  failure.value = null
}

function drop(event: DragEvent) {
  dragover.value = false
  const dropped = event.dataTransfer?.files
  if (dropped !== undefined && dropped.length > 0) {
    file.value = dropped[0]!
    failure.value = null
  }
}

async function submit() {
  const chosen = file.value
  if (chosen === null) {
    failure.value = { code: 'no_file_chosen', params: {}, status: 400 }
    return
  }
  busy.value = true
  failure.value = null
  try {
    const res = await zuordnungen.anlegen(chosen.name, chosen)
    await navigateTo({
      path: `/mappings/${res.profile.id}/edit`,
      query: { created: res.created ? '1' : '0' }
    })
  } catch (e) {
    failure.value = mappingFailure(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main id="main" class="appwrap">
    <nav class="crumbs" :aria-label="t('mapping.new.title')">
      <NuxtLink to="/mappings">{{ t('mapping.nav.mappings') }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <span>{{ t('mapping.new.title') }}</span>
    </nav>

    <h1 style="font-size:19px;margin-bottom:6px">{{ t('mapping.new.heading') }}</h1>
    <p class="note" style="margin-bottom:16px">{{ t('mapping.new.lead') }}</p>

    <div class="live-region" role="alert" aria-live="assertive">
      <div v-if="errorText" class="ui-alert" style="margin-bottom:14px">{{ errorText }}</div>
    </div>

    <form @submit.prevent="submit">
      <!-- Kein role="button" auf dem Kasten: Er enthaelt eine Ueberschrift und
           Fliesstext, und der Tastaturweg fuehrt ueber das Dateifeld. Zwei
           Tabstopps fuer dieselbe Handlung waeren einer zu viel. -->
      <div class="dropzone" :class="dragover ? 'dragover' : ''" role="group"
           :aria-label="t('mapping.new.chooseLabel')"
           @click="onZoneClick"
           @dragover.prevent="dragover = true" @dragleave="dragover = false" @drop.prevent="drop">
        <p class="ic" aria-hidden="true">📊</p>
        <h2 style="font-size:16px;margin-bottom:5px">{{ t('mapping.new.dropHeading') }}</h2>
        <p>{{ file ? file.name : t('mapping.new.dropText') }}</p>
        <p class="formats">
          <span class="fmt">CSV</span><span class="fmt">TSV</span><span class="fmt">XLSX</span>
        </p>
        <div class="pickwrap">
          <input id="samplefile" ref="input" class="sr-only" type="file"
                 accept=".csv,.tsv,.tab,.txt,.xlsx,.xlsm,.xltx,text/csv" @change="pick">
          <label for="samplefile" class="btn btn-outline btn-sm">{{ t('mapping.new.chooseLabel') }}</label>
        </div>
      </div>

      <p style="display:flex;gap:8px;align-items:center;margin-top:14px">
        <button class="btn btn-primary" type="submit" :disabled="busy || file === null">
          {{ busy ? t('mapping.new.working') : t('mapping.new.submit') }}
        </button>
        <NuxtLink class="btn btn-outline" to="/mappings">{{ t('mapping.new.cancel') }}</NuxtLink>
      </p>
    </form>

    <p class="note" style="margin-top:18px">{{ t('mapping.new.footer') }}</p>
  </main>
</template>
