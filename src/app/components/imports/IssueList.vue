<script setup lang="ts">
/**
 * Fehler und Warnungen eines Imports — an einer Stelle.
 *
 * Im PHP-Stand standen Parse-Hinweise oben und Schemabefunde unten in einer
 * eigenen Tabelle; wer nur eine der beiden Listen las, uebersah die Haelfte.
 * Hier liegt alles in einer Liste, nach Schweregrad sortiert und filterbar.
 *
 * Jede Meldung nennt, soweit bekannt: Zeile der Quelldatei, laufende Nummer
 * des Datensatzes, Quellspalte und Schemafeld. Der Vertrag verlangt genau das.
 */
import type { Severity, ValidationIssue } from '#shared/types/domain'

const props = withDefaults(
  defineProps<{ issues: ValidationIssue[]; counts: Record<Severity, number>; pageSize?: number }>(),
  { pageSize: 100 }
)
const { t } = useI18n()

type Filter = 'all' | Severity
const filter = ref<Filter>('all')
const shown = ref(props.pageSize)

const filtered = computed(() =>
  filter.value === 'all' ? props.issues : props.issues.filter((i) => i.severity === filter.value)
)
const visible = computed(() => filtered.value.slice(0, shown.value))
const total = computed(() => props.issues.length)

watch(filter, () => {
  shown.value = props.pageSize
})

const BADGE: Record<Severity, string> = { error: 'b-danger', warning: 'b-warn', info: 'b-info' }
const MARK: Record<Severity, string> = { error: '×', warning: '!', info: 'i' }

function facets(issue: ValidationIssue): string[] {
  const out: string[] = []
  if (issue.row !== undefined) out.push(t('imports.issue.row', { row: issue.row }))
  if (issue.record !== undefined) out.push(t('imports.issue.record', { record: issue.record }))
  if (issue.sourceField) out.push(t('imports.issue.sourceField', { field: issue.sourceField }))
  if (issue.targetField) out.push(t('imports.issue.targetField', { field: issue.targetField }))
  return out
}

function setFilter(value: Filter) {
  filter.value = value
}
</script>

<template>
  <section>
    <h2 class="side-h" style="margin:0 0 8px">{{ t('imports.report.issues.heading') }}</h2>
    <p class="note" style="margin:0 0 10px">{{ t('imports.report.issues.lead') }}</p>

    <div role="status" aria-live="polite" v-if="total === 0" class="ui-alert-ok">{{ t('imports.report.issues.none') }}</div>

    <template v-else>
      <div role="group" :aria-label="t('imports.report.issues.filterLabel')"
           style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <button type="button" class="chip" :aria-pressed="filter === 'all'"
                :style="filter === 'all' ? 'border-color:var(--primary);color:var(--primary)' : undefined"
                @click="setFilter('all')">{{ t('imports.report.issues.all', { count: total }) }}</button>
        <button v-if="counts.error > 0" type="button" class="chip" :aria-pressed="filter === 'error'"
                :style="filter === 'error' ? 'border-color:var(--danger);color:var(--danger)' : undefined"
                @click="setFilter('error')">{{ t('imports.report.issues.errors', { count: counts.error }) }}</button>
        <button v-if="counts.warning > 0" type="button" class="chip" :aria-pressed="filter === 'warning'"
                :style="filter === 'warning' ? 'border-color:var(--warn);color:var(--warn)' : undefined"
                @click="setFilter('warning')">{{ t('imports.report.issues.warnings', { count: counts.warning }) }}</button>
        <button v-if="counts.info > 0" type="button" class="chip" :aria-pressed="filter === 'info'"
                :style="filter === 'info' ? 'border-color:var(--info);color:var(--info)' : undefined"
                @click="setFilter('info')">{{ t('imports.report.issues.infos', { count: counts.info }) }}</button>
      </div>

      <p class="dim small" role="status" aria-live="polite" style="margin-bottom:8px">
        {{ t('imports.report.issues.shown', { shown: visible.length, total: filtered.length }) }}
      </p>

      <div class="tablewrap" style="padding:10px 12px">
        <ul class="val-list" style="list-style:none;margin:0;padding:0">
          <li v-for="(issue, index) in visible" :key="index" class="vi">
            <span class="m badge" :class="BADGE[issue.severity]" style="padding:1px 6px"
                  :title="t(`imports.issue.severity.${issue.severity}`)">
              <span aria-hidden="true">{{ MARK[issue.severity] }}</span>
              <span class="sr-only">{{ t(`imports.issue.severity.${issue.severity}`) }}</span>
            </span>
            <span style="min-width:0">
              <span class="fn">{{ issue.message }}</span>
              <span v-if="facets(issue).length > 0" class="dim small">
                <template v-for="(facet, i) in facets(issue)" :key="i"> · {{ facet }}</template>
              </span>
              <span v-else class="dim small"> · {{ t('imports.issue.noPosition') }}</span>
              <span v-if="issue.value" class="dim small mono" style="display:block;margin-top:2px">
                {{ t('imports.issue.value', { value: issue.value }) }}
              </span>
              <span v-if="issue.fix" class="dim small" style="display:block;margin-top:2px">
                {{ t('imports.issue.fix', { op: String(issue.fix.op) }) }}
              </span>
            </span>
          </li>
        </ul>
      </div>

      <p v-if="visible.length < filtered.length" style="margin-top:12px">
        <button type="button" class="btn btn-outline btn-sm" @click="shown += props.pageSize">
          {{ t('imports.report.issues.more', { count: filtered.length - visible.length }) }}
        </button>
      </p>
      <p v-else-if="total >= 500" class="note">{{ t('imports.report.issues.capped') }}</p>
    </template>
  </section>
</template>
