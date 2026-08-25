<script setup lang="ts">
/**
 * Uebersicht der Mappingprofile.
 *
 * Profile sind global sichtbar, eigene zuerst. Fremde lassen sich ansehen und
 * exportieren, aber nicht aendern: Sie sind anderswo produktiv im Einsatz.
 * Uebernommen werden sie beim Zuordnen einer eigenen Datei — als Kopie.
 */
import { failureText, mappingFailure, type MappingFailure } from '~/components/mapping/errors'

const { t, te, locale } = useI18n()
useHead({ title: () => t('mapping.list.title') })

interface ProfileRow {
  id: number
  name: string
  base_format: string
  version: number
  complete: boolean
  updated_at: string
  institution_name: string
  user_name: string | null
  use_count: number
  has_sample: boolean
  own: boolean
}

const { data, error, refresh } = await useFetch<{ profiles: ProfileRow[]; own: number }>('/api/mappings')

const loadError = computed(() => (error.value ? failureText(t, te, mappingFailure(error.value)) : ''))
const profiles = computed(() => data.value?.profiles ?? [])

/* -------------------------------------------------- Exportiertes Profil einlesen */

const importFailure = ref<MappingFailure | null>(null)
const importMessage = ref('')
const importBusy = ref(false)
const importError = computed(() => failureText(t, te, importFailure.value))

async function onProfileFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file === undefined) return
  importFailure.value = null
  importMessage.value = ''
  importBusy.value = true
  try {
    let document: unknown
    try {
      document = JSON.parse(await file.text())
    } catch {
      importFailure.value = { code: 'export_unreadable', params: {}, status: 422 }
      return
    }
    const res = await $fetch<{
      profile: { id: number; name: string }
      created: boolean
      hasSample: boolean
    }>('/api/mappings', { method: 'POST', body: { profile: document } })
    await refresh()
    importMessage.value = res.hasSample
      ? t(res.created ? 'mapping.list.imported' : 'mapping.list.updated', { name: res.profile.name })
      : t('mapping.list.importedNoSample', { name: res.profile.name })
    await navigateTo(res.hasSample ? `/mappings/${res.profile.id}/edit` : `/mappings/${res.profile.id}`)
  } catch (e) {
    importFailure.value = mappingFailure(e)
  } finally {
    importBusy.value = false
    input.value = ''
  }
}

function formatDate(value: string): string {
  const normalised = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const date = new Date(normalised)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}
</script>

<template>
  <main id="main" class="appwrap">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <h1 style="font-size:19px">{{ t('mapping.list.heading') }}</h1>
      <span class="dim small">{{ t('mapping.list.count', { n: profiles.length }, profiles.length) }}</span>
    </div>

    <div v-if="loadError" class="alert" role="alert" style="margin-bottom:14px">{{ loadError }}</div>
    <div v-if="importError" class="alert" role="alert" style="margin-bottom:14px">{{ importError }}</div>
    <div v-if="importMessage" class="alert alert-ok" role="status" style="margin-bottom:14px">{{ importMessage }}</div>

    <div class="newprofile">
      <h2 style="font-size:14px;margin-bottom:5px">{{ t('mapping.list.newHeading') }}</h2>
      <p class="note" style="margin:0">{{ t('mapping.list.newHint') }}</p>
      <p class="row">
        <NuxtLink class="btn btn-primary btn-sm" to="/mappings/new">{{ t('mapping.list.newAction') }}</NuxtLink>
      </p>

      <details style="margin-top:12px">
        <summary class="dim small" style="cursor:pointer">{{ t('mapping.list.importSummary') }}</summary>
        <p class="note">{{ t('mapping.list.importHint') }}</p>
        <p class="row">
          <label class="sr-only" for="profilejson">{{ t('mapping.list.importLabel') }}</label>
          <input id="profilejson" class="input" type="file" accept=".json,application/json"
                 style="max-width:320px" :disabled="importBusy" @change="onProfileFile">
        </p>
      </details>
    </div>

    <div v-if="profiles.length === 0" class="tablewrap">
      <div class="empty">
        <p class="ic" aria-hidden="true">🗺</p>
        <p class="fn" style="font-size:15px;margin-bottom:4px">{{ t('mapping.list.emptyHeading') }}</p>
        <p class="small">{{ t('mapping.list.emptyText') }}</p>
      </div>
    </div>

    <div v-else class="tablewrap">
      <table>
        <caption class="sr-only">{{ t('mapping.list.caption') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('mapping.list.name') }}</th>
            <th scope="col">{{ t('mapping.list.institution') }}</th>
            <th scope="col">{{ t('mapping.list.base') }}</th>
            <th scope="col">{{ t('mapping.list.state') }}</th>
            <th scope="col">{{ t('mapping.list.used') }}</th>
            <th scope="col">{{ t('mapping.list.changed') }}</th>
            <th scope="col" style="text-align:right">{{ t('mapping.list.action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="profile in profiles" :key="profile.id">
            <td>
              <div class="fn">{{ profile.name }}</div>
              <div class="dim small">
                {{ t('mapping.list.version', { n: profile.version }) }}
                <template v-if="profile.user_name"> · {{ t('mapping.list.by', { name: profile.user_name }) }}</template>
              </div>
            </td>
            <td>
              {{ profile.institution_name }}
              <span v-if="profile.own" class="fmt" style="margin-left:6px">{{ t('mapping.list.own') }}</span>
            </td>
            <td><span class="fmt">{{ profile.base_format.toUpperCase() }}</span></td>
            <td>
              <span v-if="profile.complete" class="badge b-ok"><span class="bd" />{{ t('mapping.list.complete') }}</span>
              <span v-else class="badge b-wait"><span class="bd" />{{ t('mapping.list.incomplete') }}</span>
              <span v-if="!profile.has_sample" class="badge b-warn" style="margin-left:4px">
                <span class="bd" />{{ t('mapping.list.noSample') }}
              </span>
            </td>
            <td class="tnum">{{ t('mapping.list.imports', { n: profile.use_count }) }}</td>
            <td class="dim small tnum">{{ formatDate(profile.updated_at) }}</td>
            <td style="text-align:right">
              <div class="rowactions">
                <NuxtLink v-if="profile.own && profile.has_sample" class="btn btn-primary btn-sm"
                          :to="`/mappings/${profile.id}/edit`">{{ t('mapping.list.edit') }}</NuxtLink>
                <NuxtLink class="btn btn-outline btn-sm" :to="`/mappings/${profile.id}`">
                  {{ t('mapping.list.view') }}
                </NuxtLink>
                <a class="btn btn-outline btn-sm" :href="`/api/mappings/${profile.id}/export`"
                   :title="t('mapping.list.export')">⭳<span class="sr-only"> {{ t('mapping.list.export') }}</span></a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="note" style="margin-top:14px">{{ t('mapping.list.footer') }}</p>
  </main>
</template>
