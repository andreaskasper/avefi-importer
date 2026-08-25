<script setup lang="ts">
/**
 * Importuebersicht: hochladen und sehen, was daraus geworden ist.
 *
 * Die Liste haelt sich selbst aktuell, solange etwas laeuft. Im PHP-Stand
 * fehlte das und wurde beanstandet: „In Konvertierung" blieb stehen, bis
 * jemand neu lud, und niemand wusste, ob noch gearbeitet wird.
 */
import { apiFailure, failureText, type ApiFailure } from '~/components/imports/errors'
import { formatNumber } from '~/components/imports/format'
import { BUSY_STATES, type ImportListResponse, type ImportStatusResponse } from '~/components/imports/types'

const { t, te, locale } = useI18n()
const route = useRoute()
useHead({ title: () => t('imports.pageTitle') })

const { data, refresh, error } = await useFetch<ImportListResponse>('/api/imports', {
  default: () => ({ imports: [], kpi: { records: 0, awaiting: 0 } })
})

const loadFailure = computed<ApiFailure | null>(() => (error.value ? apiFailure(error.value) : null))
const loadError = computed(() => failureText(t, te, loadFailure.value))

const items = computed(() => data.value?.imports ?? [])
const kpi = computed(() => data.value?.kpi ?? { records: 0, awaiting: 0 })
const busy = computed(() => items.value.some((i) => BUSY_STATES.has(i.status)))

/** Was sich ohne Seitenwechsel aendert, muss angesagt werden. */
const announcement = ref('')

/**
 * Sichtbare Rueckmeldung zu einer eben ausgefuehrten Handlung.
 * Sie steht zusaetzlich in der Ansage: Wer nicht sieht, soll nicht raten.
 */
const notice = ref('')

// Nach der Blattauswahl kommt die Zahl der angelegten Importe als Parameter
// zurueck. Ohne diese Zeile stuende der Mensch vor einer Liste, in der sich
// still etwas geaendert hat.
onMounted(() => {
  const created = Number(route.query.sheets ?? 0)
  if (created > 0) {
    notice.value = t('imports.sheets.started', { count: created }, created)
    announcement.value = notice.value
    navigateTo({ path: '/', query: {} }, { replace: true })
  }
})

function setNotice(text: string) {
  notice.value = text
  announcement.value = text
}

let timer: ReturnType<typeof setInterval> | null = null

function stop() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

async function poll() {
  const status = await $fetch<ImportStatusResponse>('/api/imports/status').catch(() => null)
  if (status === null) {
    stop()
    return
  }

  let changed = status.count !== items.value.length ? 1 : 0
  for (const item of items.value) {
    const now = status.imports[item.id]
    if (now === undefined) {
      changed++
      continue
    }
    if (
      now.status !== item.status ||
      now.records !== item.record_count ||
      now.progress !== item.upload_progress
    ) {
      changed++
    }
  }

  if (changed > 0) {
    await refresh()
    announcement.value = t('imports.table.updated', { count: changed }, changed)
  }
  if (!status.busy) stop()
}

function start() {
  if (timer !== null || import.meta.server) return
  timer = setInterval(poll, 5000)
}

function onVisibility() {
  // Im Hintergrund wird nicht gefragt; kommt der Reiter zurueck, wird sofort
  // einmal nachgesehen, statt fuenf Sekunden veraltet dazustehen.
  if (document.hidden) stop()
  else if (busy.value) {
    poll()
    start()
  }
}

watch(busy, (value) => (value ? start() : stop()), { immediate: true })

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  if (busy.value) start()
})
onBeforeUnmount(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisibility)
})

async function afterUpload() {
  await refresh()
  start()
}
</script>

<template>
  <main id="main" class="appwrap">
    <h1 class="sr-only">{{ t('imports.heading') }}</h1>

    <div v-if="loadFailure !== null" class="alert" role="alert" style="margin-bottom:14px">{{ loadError }}</div>

    <ImportsUploadPanel @uploaded="afterUpload" @queued="afterUpload" />

    <div class="grid2" style="margin:16px 0">
      <div class="card kpi">
        <span class="v tnum">{{ formatNumber(kpi.records, locale) }}</span>
        <span class="l">{{ t('imports.kpi.records') }}</span>
      </div>
      <div class="card kpi">
        <span class="v tnum">{{ formatNumber(kpi.awaiting, locale) }}</span>
        <span class="l">{{ t('imports.kpi.awaiting') }}</span>
      </div>
    </div>

    <div v-if="notice !== ''" class="alert-ok" style="margin-bottom:12px">{{ notice }}</div>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <ImportsImportTable :items="items" @changed="refresh" @message="setNotice" />

    <ImportsPipeline />
  </main>
</template>
