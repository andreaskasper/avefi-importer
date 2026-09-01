<script setup lang="ts">
/**
 * Zuordnung fuer einen Import.
 *
 * Die Seite holt die Startnutzlast und uebergibt sie dem Editor. Die
 * Betriebsart "am Import" unterscheidet sich vom Profil-Editor nur darin, dass
 * hier nach dem Speichern konvertiert werden kann.
 */
import MappingEditor from '~/components/mapping/Editor.vue'
import { failureText, mappingFailure } from '~/components/mapping/errors'
import type { EditorPayload } from '~/components/mapping/types'

const api = useApi()

const route = useRoute()
const { t, te } = useI18n()
const id = computed(() => String(route.params.id ?? ''))

interface Response {
  import: { id: string; filename: string; status: string; base_format: string | null }
  payload: EditorPayload
}

const { data, error } = await useFetch<Response>(() => api(`/imports/${id.value}/mapping`))

const loadError = computed(() => (error.value ? failureText(t, te, mappingFailure(error.value)) : ''))
const filename = computed(() => data.value?.import.filename ?? id.value)

useHead({ title: () => `${filename.value} · ${t('mapping.crumb')}` })
</script>

<template>
  <main id="main" class="appwrap wide">
    <nav class="crumbs" :aria-label="t('mapping.crumb')">
      <NuxtLink to="/">{{ t('mapping.nav.imports') }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <NuxtLink :to="`/imports/${id}`">{{ filename }}</NuxtLink>
      <span class="sep" aria-hidden="true">/</span>
      <span>{{ t('mapping.crumb') }}</span>
    </nav>

    <div role="alert" aria-live="assertive" v-if="loadError" class="alert">{{ loadError }}</div>

    <MappingEditor v-else-if="data" :payload="data.payload" back-to="/" :back-label="t('mapping.nav.imports')" />
  </main>
</template>
