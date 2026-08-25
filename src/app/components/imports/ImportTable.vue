<script setup lang="ts">
/**
 * Die Importliste.
 *
 * Je Zeile eine Handlung, die zum Stand passt, dazu das „…"-Menue mit allem
 * Weiteren. Ein abgeblendeter Knopf „Bearbeiten" wie im PHP-Stand steht hier
 * nicht mehr: Wo nichts zu bearbeiten ist, fuehrt der Weg zur Detailseite, und
 * die sagt, woran es liegt.
 */
import { apiFailure, failureText, type ApiFailure } from './errors'
import { fileSize, formatDetailLabel, formatNumber } from './format'
import type { ImportListItem } from './types'

const props = defineProps<{ items: ImportListItem[] }>()
const emit = defineEmits<{ changed: []; message: [string] }>()

const { t, te, locale } = useI18n()

type Pending = { kind: 'delete' | 'reconvert'; item: ImportListItem } | null
const pending = ref<Pending>(null)
const busy = ref(false)
const failure = ref<ApiFailure | null>(null)
const failureMessage = computed(() => failureText(t, te, failure.value))

const dialogTitle = computed(() =>
  pending.value?.kind === 'delete' ? t('imports.confirm.delete.title') : t('imports.confirm.reconvert.title')
)
const dialogText = computed(() => {
  if (pending.value === null) return ''
  if (pending.value.kind === 'delete') return t('imports.confirm.delete.text')
  const edited = pending.value.item.edited
  // Die Zahl kommt aus records.edited_at, nicht aus einer Schaetzung: Wer
  // erfaehrt, dass drei Datensaetze verloren gehen, entscheidet anders als
  // jemand, dem nur „Aenderungen gehen verloren" gesagt wird.
  return edited > 0
    ? t('imports.confirm.reconvert.edited', { count: formatNumber(edited, locale.value) }, edited)
    : t('imports.confirm.reconvert.plain')
})
const dialogOk = computed(() => {
  if (pending.value === null) return ''
  if (pending.value.kind === 'delete') return t('imports.confirm.delete.ok')
  return pending.value.item.edited > 0
    ? t('imports.confirm.reconvert.okEdited')
    : t('imports.confirm.reconvert.ok')
})
const dialogDanger = computed(
  () => pending.value?.kind === 'delete' || (pending.value?.item.edited ?? 0) > 0
)

async function confirm() {
  const job = pending.value
  if (job === null) return
  busy.value = true
  failure.value = null
  try {
    if (job.kind === 'delete') {
      await $fetch(`/api/imports/${job.item.id}`, { method: 'DELETE' })
      emit('message', t('imports.toast.deleted'))
    } else {
      await $fetch(`/api/imports/${job.item.id}/reconvert`, { method: 'POST' })
      emit('message', t('imports.toast.reconverting'))
    }
    pending.value = null
    emit('changed')
  } catch (e) {
    failure.value = apiFailure(e)
    pending.value = null
  } finally {
    busy.value = false
  }
}

function formatLabel(item: ImportListItem): string {
  // Bestandteile bevorzugt, weil nur sie uebersetzbar sind. Importe aus der
  // Zeit davor haben nur den fertigen deutschen Text in detected_format.
  const parts = formatDetailLabel(item.format_detail)
  if (parts !== null) return t(parts.key, parts.params, parts.count)
  return item.detected_format ?? (item.base_format ? item.base_format.toUpperCase() : '')
}

function sizeOf(bytes: number) {
  return fileSize(bytes, locale.value)
}

function progressOf(item: ImportListItem): number {
  return Math.max(0, Math.min(100, item.upload_progress))
}
</script>

<template>
  <div>
    <div v-if="failure !== null" class="alert" role="alert" style="margin-bottom:12px">{{ failureMessage }}</div>

    <div v-if="props.items.length === 0" class="tablewrap">
      <div class="empty">
        <div class="ic" aria-hidden="true">📂</div>
        <p class="fn" style="font-size:15px;margin-bottom:4px">{{ t('imports.table.empty.heading') }}</p>
        <p class="small">{{ t('imports.table.empty.text') }}</p>
      </div>
    </div>

    <div v-else class="tablewrap">
      <table>
        <caption class="sr-only">{{ t('imports.table.caption') }}</caption>
        <colgroup>
          <col style="width:26%"><col style="width:13%"><col style="width:11%">
          <col style="width:16%"><col style="width:9%"><col style="width:13%">
          <col style="width:200px">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{{ t('imports.table.file') }}</th>
            <th scope="col">{{ t('imports.table.format') }}</th>
            <th scope="col">{{ t('imports.table.upload') }}</th>
            <th scope="col">{{ t('imports.table.processing') }}</th>
            <th scope="col">{{ t('imports.table.records') }}</th>
            <th scope="col">{{ t('imports.table.created') }}</th>
            <th scope="col" style="text-align:right">{{ t('imports.table.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in props.items" :key="item.id">
            <td>
              <div class="fn" :title="item.filename">{{ item.filename }}</div>
              <div v-if="sizeOf(item.filesize) !== null" class="dim small">
                {{ t(sizeOf(item.filesize)!.key, sizeOf(item.filesize)!.params) }}
              </div>
            </td>
            <td>
              <span v-if="formatLabel(item) !== ''" class="fmt" :title="formatLabel(item)">{{ formatLabel(item) }}</span>
              <span v-else class="dim">{{ t('imports.table.none') }}</span>
            </td>
            <td style="min-width:110px">
              <div class="prog" :class="progressOf(item) >= 100 ? 'ok' : 'acc'" role="progressbar"
                   aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressOf(item)"
                   :aria-label="t('imports.table.progressLabel', { percent: progressOf(item) })">
                <i :style="{ width: progressOf(item) + '%' }" />
              </div>
              <div class="dim small tnum" aria-hidden="true">{{ progressOf(item) }} %</div>
            </td>
            <td><ImportsStatusBadge :status="item.status" /></td>
            <td class="tnum">
              <template v-if="item.record_count > 0">{{ formatNumber(item.record_count, locale) }}</template>
              <span v-else class="dim">{{ t('imports.table.none') }}</span>
            </td>
            <td class="dim small tnum"><ImportsTimeStamp :value="item.created_at" /></td>
            <td style="text-align:right">
              <div class="rowactions">
                <NuxtLink v-if="item.status === 'awaiting_sheet_choice'" class="btn btn-primary btn-sm"
                          :to="`/imports/${item.id}/sheets`">{{ t('imports.action.chooseSheet') }}</NuxtLink>
                <NuxtLink v-else-if="item.status === 'awaiting_format_review' && item.tabular"
                          class="btn btn-primary btn-sm" :to="`/imports/${item.id}/mapping`">
                  {{ t('imports.action.map') }}</NuxtLink>
                <NuxtLink v-else-if="item.status === 'converted'" class="btn btn-primary btn-sm"
                          :to="`/imports/${item.id}/records`">{{ t('imports.action.edit') }}</NuxtLink>
                <NuxtLink v-else class="btn btn-outline btn-sm" :to="`/imports/${item.id}`"
                          :style="item.status === 'error' ? 'color:var(--danger);border-color:var(--danger)' : undefined">
                  {{ t('imports.action.details') }}</NuxtLink>

                <ImportsRowMenu :item="item" @delete="pending = { kind: 'delete', item }"
                                @reconvert="pending = { kind: 'reconvert', item }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ImportsConfirmDialog :open="pending !== null" :title="dialogTitle" :message="dialogText" :ok-text="dialogOk"
                          :danger="dialogDanger" :busy="busy" @cancel="pending = null" @confirm="confirm" />
  </div>
</template>
