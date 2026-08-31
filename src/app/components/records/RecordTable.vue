<script setup lang="ts">
/**
 * Die Datensatzliste eines Imports.
 *
 * Statt eines Vollstaendigkeitsrings steht hier "3 von 4 Kernfeldern" samt der
 * Namen der fehlenden. Ein Prozentwert bewertet die Daten eines Hauses, ohne zu
 * sagen, was fehlt — und die Kernfelder sind das, woran der Abgleich mit
 * anderen Bestaenden haengt, nicht ein Anteil belegter Felder.
 */
import { formatDateTime } from '~/components/imports/format'
import type { RecordListItem } from './types'

defineProps<{ records: RecordListItem[]; importId: string }>()

const { t, locale } = useI18n()

/** Beschriftung eines Kernfelds — die Schluessel kommen vom Server. */
function coreLabel(key: string): string {
  return t(`records.table.coreField.${key}`)
}

function coreTitle(r: RecordListItem): string {
  return r.core.missing.length === 0
    ? t('records.table.coreComplete')
    : t('records.table.coreMissing', { fields: r.core.missing.map(coreLabel).join(', ') })
}


</script>

<template>
  <div class="tablewrap">
    <table>
      <caption class="sr-only">{{ t('records.table.caption') }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ t('records.table.title') }}</th>
          <th scope="col">{{ t('records.table.year') }}</th>
          <th scope="col">{{ t('records.table.type') }}</th>
          <th scope="col">{{ t('records.table.pid') }}</th>
          <th scope="col">{{ t('records.table.counts') }}</th>
          <th scope="col">{{ t('records.table.core') }}</th>
          <th scope="col" style="text-align:right">{{ t('records.table.action') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.id">
          <td>
            <!-- Eigenes Element um den Titel: Eine Einfuegung unmittelbar neben
                 einem v-if fuehrt zu unterschiedlichen Leerzeichen in Server- und
                 Browserdarstellung, und die Seite wird beim Uebernehmen neu gebaut. -->
            <div class="fn">
              <span>{{ r.title && r.title.trim() !== '' ? r.title : t('records.table.untitled') }}</span>
              <span v-if="r.missing.length > 0" class="badge b-danger" style="padding:1px 7px;margin-left:6px"
                    :title="t('records.table.missingTitle', { list: r.missing.join(', ') })">
                {{ t('records.table.missing') }}</span>
              <span v-if="r.editedAt" class="badge b-info" style="padding:1px 7px;margin-left:6px"
                    :title="t('records.table.editedAt', { when: formatDateTime(r.editedAt, locale) })">
                {{ t('records.table.edited') }}</span>
            </div>
            <div v-if="r.contributors.length > 0" class="dim small">{{ r.contributors.join(', ') }}</div>
            <div v-else-if="r.sourceRow !== null" class="dim small">
              {{ t('records.table.sourceRow', { row: r.sourceRow }) }}
            </div>
          </td>
          <td class="tnum">
            <span v-if="r.year !== null">{{ r.year }}</span>
            <span v-else class="dim">{{ t('records.table.none') }}</span>
          </td>
          <td>
            <span v-if="r.type" class="badge b-neutral">{{ r.type }}</span>
            <span v-else class="dim">{{ t('records.table.noType') }}</span>
          </td>
          <td class="mono small">
            <span v-if="r.pid">{{ r.pid }}</span>
            <span v-else class="dim">{{ t('records.table.noPid') }}</span>
          </td>
          <td class="tnum small">{{ r.manifestations }} / {{ r.items }}</td>
          <td>
            <!-- Benannte Angaben statt eines Prozentwerts: "3 von 4" sagt, dass
                 etwas fehlt, und der Zusatz sagt, WAS. Ein Anteil bewertet die
                 Daten eines Hauses, ohne etwas zu erklaeren. -->
            <span class="core" :class="r.core.filled === r.core.total ? 'core-full' : 'core-part'"
                  :title="coreTitle(r)">
              {{ t('records.table.coreValue', { filled: r.core.filled, total: r.core.total }) }}
            </span>
            <span v-if="r.core.missing.length" class="dim small core-missing">
              {{ r.core.missing.map(coreLabel).join(', ') }}
            </span>
          </td>
          <td style="text-align:right">
            <NuxtLink class="btn btn-primary btn-sm" :to="`/imports/${importId}/records/${r.id}`"
                      :aria-label="t('records.table.editLabel', { title: r.title ?? t('records.table.untitled') })">
              <span aria-hidden="true">✎</span> {{ t('records.table.edit') }}
            </NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
