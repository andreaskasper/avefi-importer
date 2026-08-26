<script setup lang="ts">
/**
 * Datei hochladen — per Ablegen oder ueber ein gewoehnliches Dateifeld.
 *
 * Das Dateifeld ist sichtbar und beschriftet, nicht versteckt hinter einem
 * anklickbaren Kasten. Der Vertrag verlangt zum Ablegen eine gleichwertige
 * klassische Auswahl; ein <input type=file> mit Beschriftung ist gleichwertig,
 * ein Kasten, der Klicks abfaengt, ist es fuer die Tastatur nicht.
 *
 * Uebertragen wird der Dateiinhalt als Rumpf, nicht als Multipart. So laesst
 * sich der Fortschritt anzeigen (XMLHttpRequest) und der Server muss die Datei
 * nicht in den Arbeitsspeicher lesen.
 */
import { apiFailure, failureText, type ApiFailure } from './errors'

const emit = defineEmits<{ uploaded: []; queued: [] }>()
const { t, te } = useI18n()

const MAX_BYTES = 250 * 1024 * 1024
const MAX_MB = Math.round(MAX_BYTES / 1048576)
const ACCEPTED = ['csv', 'tsv', 'tab', 'xlsx', 'xlsm', 'xltx', 'xml', 'ead', 'marcxml', 'marc', 'json']
const REJECTED_WORKBOOKS: Record<string, string> = { xls: 'workbook_unsupported_xls', ods: 'workbook_unsupported_ods' }
const ACCEPT_ATTR = ACCEPTED.map((e) => `.${e}`).join(',')

interface Job {
  key: number
  name: string
  percent: number
  state: 'running' | 'ok' | 'error'
  message: string
}

let nextKey = 1
const jobs = ref<Job[]>([])
const dragging = ref(false)
const fileField = ref<HTMLInputElement | null>(null)

/**
 * Klick irgendwo auf die Ablageflaeche oeffnet die Dateiauswahl.
 *
 * app.css setzt fuer .dropzone cursor:pointer — ohne diesen Handler verspricht
 * der Mauszeiger etwas, das nicht passiert. Klicks auf echte Bedienelemente
 * innerhalb der Flaeche (Knopf, Label, Eingabefeld, Verweis) bleiben unberuehrt,
 * sonst wuerde der Dialog doppelt aufgehen.
 */
function onZoneClick(e: MouseEvent) {
  const ziel = e.target as HTMLElement | null
  if (ziel?.closest('label, button, input, a, select, textarea')) return
  fileField.value?.click()
}

/** Meldung des Uploads fuer Vorlesewerkzeuge — sonst bleibt der Fortschritt stumm. */
const announcement = ref('')

const urlValue = ref('')
const urlBusy = ref(false)
const urlFailure = ref<ApiFailure | null>(null)
const urlDone = ref(false)
const urlError = computed(() => failureText(t, te, urlFailure.value))

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Grund, warum eine Datei nicht angenommen wird — als Kennung, damit der Satz
 * aus derselben Quelle kommt wie beim Server.
 */
function rejectionCode(file: File): { code: string; params: Record<string, unknown> } | null {
  const ext = extensionOf(file.name)
  if (ext === '') return { code: 'no_extension', params: {} }
  const workbook = REJECTED_WORKBOOKS[ext]
  if (workbook) return { code: workbook, params: { ext } }
  if (!ACCEPTED.includes(ext)) return { code: 'format_unsupported', params: { ext } }
  if (file.size > MAX_BYTES) return { code: 'too_large', params: { max: MAX_MB } }
  if (file.size === 0) return { code: 'empty_file', params: {} }
  return null
}

function codeText(code: string, params: Record<string, unknown>): string {
  const key = `imports.error.${code}`
  return te(key) ? t(key, params) : t('imports.error.unexpected')
}

function send(file: File, job: Job): Promise<void> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/imports/upload?name=${encodeURIComponent(file.name)}`, true)
    xhr.setRequestHeader('content-type', 'application/octet-stream')
    xhr.withCredentials = true

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) job.percent = Math.round((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        job.percent = 100
        job.state = 'ok'
        job.message = t('imports.upload.done')
        announcement.value = t('imports.upload.finished', { name: job.name })
      } else {
        let body: unknown = null
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          body = null
        }
        const failure = apiFailure({ statusCode: xhr.status, data: body })
        job.state = 'error'
        job.message = failureText(t, te, failure)
        announcement.value = t('imports.upload.rejected', { name: job.name, reason: job.message })
      }
      resolve()
    })
    xhr.addEventListener('error', () => {
      job.state = 'error'
      job.message = t('imports.error.network')
      announcement.value = t('imports.upload.rejected', { name: job.name, reason: job.message })
      resolve()
    })
    xhr.send(file)
  })
}

async function handleFiles(list: FileList | File[] | null) {
  const files = Array.from(list ?? [])
  if (files.length === 0) return
  let ok = 0

  for (const file of files) {
    const job: Job = { key: nextKey++, name: file.name, percent: 0, state: 'running', message: '' }
    jobs.value.push(job)

    const rejected = rejectionCode(file)
    if (rejected !== null) {
      job.state = 'error'
      job.message = codeText(rejected.code, rejected.params)
      announcement.value = t('imports.upload.rejected', { name: job.name, reason: job.message })
      continue
    }

    announcement.value = t('imports.upload.started', { name: job.name })
    await send(file, job)
    if (job.state === 'ok') ok++
  }

  if (ok > 0) emit('uploaded')
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  handleFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

async function submitUrl() {
  urlFailure.value = null
  urlDone.value = false
  const url = urlValue.value.trim()
  if (url === '') {
    urlFailure.value = { code: 'url_invalid', params: {}, status: 400 }
    return
  }
  urlBusy.value = true
  try {
    await $fetch('/api/imports/url', { method: 'POST', body: { url } })
    urlValue.value = ''
    urlDone.value = true
    emit('queued')
  } catch (e) {
    urlFailure.value = apiFailure(e)
  } finally {
    urlBusy.value = false
  }
}

function clearJobs() {
  jobs.value = []
  announcement.value = ''
  fileField.value?.focus()
}
</script>

<template>
  <section :aria-label="t('imports.upload.legend')">
    <div class="dropzone" :class="{ dragover: dragging }" role="group"
         :aria-label="t('imports.upload.zoneLabel')"
         @click="onZoneClick"
         @dragenter.prevent="dragging = true" @dragover.prevent="dragging = true"
         @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
      <div class="ic" aria-hidden="true">⬆</div>
      <h2 style="font-size:16px;margin-bottom:5px">{{ t('imports.upload.dropHeading') }}</h2>
      <p>{{ t('imports.upload.dropHint', { max: MAX_MB }) }}</p>

      <div class="formats" aria-hidden="true">
        <span class="fmt">CSV</span><span class="fmt">TSV</span><span class="fmt">XLSX</span>
        <span class="fmt">XML</span><span class="fmt">EAD</span><span class="fmt">MARC-XML</span><span class="fmt">JSON</span>
      </div>

      <!-- Der Eingabeknopf traegt den Tastaturfokus, das Label ist seine sichtbare
           Gestalt. Ein Tab-Stopp statt zwei, Fokusring sitzt am Knopf. -->
      <div class="pickwrap">
        <input id="import-file" ref="fileField" class="sr-only" type="file" multiple
               :accept="ACCEPT_ATTR" @change="onPick">
        <label for="import-file" class="btn btn-outline btn-sm">{{ t('imports.upload.fileLabel') }}</label>
      </div>

      <p class="dim small" style="margin-top:10px">{{ t('imports.upload.sheetHint') }}</p>
    </div>

    <form class="urlform" @submit.prevent="submitUrl">
      <label class="dim small" for="import-url" style="white-space:nowrap">{{ t('imports.url.label') }}</label>
      <input id="import-url" v-model="urlValue" class="input" type="url" inputmode="url"
             :placeholder="t('imports.url.placeholder')" :aria-label="t('imports.url.field')"
             :aria-invalid="urlFailure !== null ? 'true' : undefined"
             :aria-describedby="urlFailure !== null ? 'import-url-error' : undefined">
      <button class="btn btn-outline btn-sm" type="submit" :disabled="urlBusy">
        {{ urlBusy ? t('imports.url.submitting') : t('imports.url.submit') }}
      </button>
    </form>

    <div aria-live="polite">
      <div v-if="urlFailure !== null" id="import-url-error" class="alert" style="margin-top:10px">{{ urlError }}</div>
      <div v-if="urlDone" class="alert-ok" style="margin-top:10px">{{ t('imports.url.added') }}</div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <div v-if="jobs.length > 0" class="upload-list" :aria-label="t('imports.upload.listLabel')">
      <div v-for="job in jobs" :key="job.key" class="upload-item">
        <div class="ui-head">
          <span class="fn">{{ job.name }}</span>
          <span class="ui-status small" :class="job.state === 'ok' ? 'ui-ok' : job.state === 'error' ? 'ui-err' : 'dim'">
            <template v-if="job.state === 'running'">{{ t('imports.upload.progress', { percent: job.percent }) }}</template>
            <template v-else-if="job.state === 'ok'">✓ {{ t('imports.upload.done') }}</template>
            <template v-else>✕ {{ t('imports.upload.failed') }}</template>
          </span>
        </div>
        <div class="prog" :class="job.state === 'ok' ? 'ok' : job.state === 'error' ? '' : 'acc'"
             role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="job.percent"
             :aria-label="t('imports.table.progressLabel', { percent: job.percent })">
          <i :style="{ width: (job.state === 'error' ? 100 : job.percent) + '%' }" />
        </div>
        <p v-if="job.state === 'error'" class="small" style="margin-top:7px;color:var(--danger)">{{ job.message }}</p>
      </div>
      <div>
        <button class="ghost" type="button" @click="clearJobs">{{ t('imports.upload.clear') }}</button>
      </div>
    </div>
  </section>
</template>
