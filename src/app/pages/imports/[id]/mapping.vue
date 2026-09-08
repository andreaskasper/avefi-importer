<script setup lang="ts">
import { importsService, type ImportMappingResponse } from '~/services/imports'
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

const importe = importsService()

const route = useRoute()
const { t, te } = useI18n()
const id = computed(() => String(route.params.id ?? ''))

const { data, error } = await useFetch<ImportMappingResponse>(() => importe.zuordnungPfad(id.value))

const loadError = computed(() => (error.value ? failureText(t, te, mappingFailure(error.value)) : ''))

/*
 * Der Editor zeigt immer den heutigen Stand des Profils — alles andere waere
 * eine Falle, weil Speichern den alten Stand fortschriebe. Wer aber von einem
 * konkreten Import hierherkommt, erwartet die Version, mit der dieser Import
 * gelaufen ist. Deshalb sagt die Seite es, statt es offenzulassen (#6).
 */
const version = computed(() => data.value?.version ?? null)
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

    <div role="alert" aria-live="assertive" v-if="loadError" class="ui-alert">{{ loadError }}</div>

    <div v-else-if="version?.abweichend" class="ui-alert ui-alert-warn" style="margin-bottom:14px">
      <p style="margin:0">
        {{ t('mapping.versionView.hint', { gezeigt: version.aktuell, verwendet: version.verwendet }) }}
      </p>
      <p style="margin:6px 0 0">
        <NuxtLink v-if="version.profilId !== null"
                  :to="`/mappings/${version.profilId}/versionen/${version.verwendet}`">
          {{ t('mapping.versionView.viewUsed', { n: version.verwendet }) }}
        </NuxtLink>
      </p>
    </div>

    <MappingEditor v-else-if="data" :payload="data.payload" back-to="/" :back-label="t('mapping.nav.imports')" />
  </main>
</template>
