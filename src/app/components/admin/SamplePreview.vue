<script setup lang="ts">
/**
 * Strukturvorschau einer Datei mit unbekanntem Format.
 *
 * Zwei Formen: Tabelle (Spalten und Beispielzeilen) oder Baum (Wurzelelement,
 * Namensraum, Kindelemente). Fehlt beides, wird das gesagt — nicht mit einer
 * leeren Tabelle so getan, als sei nichts drin gewesen.
 */
defineProps<{
  columns: string[]
  rows: string[][]
  tree: { root: string; namespace: string; children: string[] } | null
}>()
const { t } = useI18n()
</script>

<template>
  <div v-if="tree !== null" class="ui-card">
    <div class="frow" style="grid-template-columns:150px 1fr;padding:8px 0">
      <span class="side-h" style="margin:0">{{ t('admin.reviews.detail.root') }}</span>
      <span class="fval mono small">{{ tree.root }}</span>
    </div>
    <div class="frow" style="grid-template-columns:150px 1fr;padding:8px 0">
      <span class="side-h" style="margin:0">{{ t('admin.reviews.detail.namespace') }}</span>
      <span class="fval mono small">{{ tree.namespace || t('admin.reviews.table.none') }}</span>
    </div>
    <div class="frow" style="grid-template-columns:150px 1fr;padding:8px 0;border-bottom:0">
      <span class="side-h" style="margin:0">{{ t('admin.reviews.detail.children') }}</span>
      <span class="fval">
        <span v-for="c in tree.children" :key="c" class="fmt" style="margin:0 4px 4px 0;display:inline-block">{{ c }}</span>
        <span v-if="tree.children.length === 0" class="dim">{{ t('admin.reviews.table.none') }}</span>
      </span>
    </div>
  </div>

  <!-- Der Bereich rollt waagerecht und enthaelt selbst kein Bedienelement.
       Ohne tabindex kaeme man mit der Tastatur nicht an die rechten Spalten. -->
  <div v-else-if="columns.length > 0" class="tablewrap" role="region" tabindex="0"
       :aria-label="t('admin.reviews.detail.preview')">
    <table>
      <caption class="sr-only">{{ t('admin.reviews.detail.preview') }}</caption>
      <thead>
        <tr><th v-for="c in columns" :key="c" scope="col">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="(cell, j) in columns.length" :key="j" class="small">{{ row[j] ?? '' }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td class="dim" :colspan="Math.max(1, columns.length)">{{ t('admin.reviews.detail.noRows') }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else class="ui-card">
    <p class="dim small" style="margin:0">{{ t('admin.reviews.detail.noSample') }}</p>
  </div>
</template>
