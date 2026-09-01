<script setup lang="ts">
/**
 * Normdaten zuordnen: Kandidaten zu einem Quellwert bestaetigen.
 *
 * Angezeigt werden auch die nicht eindeutigen Treffer. Der Mensch soll sehen,
 * was die Automatik gefunden und aus Vorsicht verworfen hat — sonst wirkt eine
 * fehlende Verknuepfung wie ein Fehler des Dienstes.
 *
 * "Bewusst offen lassen" ist eine eigene Antwort: Sie wird gespeichert, damit
 * der Editor nicht bei jedem Aufruf erneut danach fragt.
 */
import type { AuthorityCandidate, AuthorityRequest } from './types'

const props = defineProps<{
  request: AuthorityRequest | null
  candidates: AuthorityCandidate[]
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  choose: [entry: { id: string; type: string; label?: string }]
}>()

const { t } = useI18n()
const box = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let returnTo: HTMLElement | null = null

watch(
  () => props.request,
  async (open) => {
    if (open !== null) {
      returnTo = document.activeElement as HTMLElement | null
      await nextTick()
      closeButton.value?.focus()
    } else if (returnTo !== null) {
      returnTo.focus()
      returnTo = null
    }
  }
)

function onKeydown(e: KeyboardEvent) {
  if (props.request === null) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  // Der Fokus bleibt im Dialog: sonst bedient man eine Seite, die gerade nicht
  // bedienbar sein soll.
  if (e.key !== 'Tab' || box.value === null) return
  const focusable = box.value.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div v-if="request !== null" class="modal-overlay" @click.self="emit('close')">
        <div ref="box" class="modal-box" role="dialog" aria-modal="true" aria-labelledby="auth-title"
             style="max-width:720px">
          <div class="modal-head">
            <h2 id="auth-title" style="font-size:15px;flex:1">
              {{ t('mapping.authority.dialogTitle', { value: request.value }) }}
            </h2>
            <button ref="closeButton" class="modal-x" type="button" :aria-label="t('mapping.authority.close')"
                    @click="emit('close')">×</button>
          </div>

          <div class="modal-body">
            <p role="status" aria-live="polite" v-if="busy" class="dim">
              {{ t('mapping.authority.searching', { source: request.source.toUpperCase() }) }}
            </p>
            <p v-else-if="error" class="alert" role="alert">{{ error }}</p>
            <template v-else>
              <p v-if="candidates.length === 0" class="note" style="margin:0">{{ t('mapping.authority.noHits') }}</p>
              <div v-for="(candidate, i) in candidates" :key="i" class="candrow">
                <div>
                  <div class="fn">
                    {{ candidate.label }}
                    <span v-if="candidate.exact" class="badge b-ok"><span class="bd" />{{ t('mapping.authority.exact') }}</span>
                  </div>
                  <div class="dim small">
                    <span class="mono">{{ candidate.id }}</span>
                    <template v-if="candidate.description"> · {{ candidate.description }}</template>
                    <template v-if="candidate.source"> · {{ candidate.source.toUpperCase() }}</template>
                  </div>
                </div>
                <button type="button" class="btn btn-primary btn-sm"
                        @click="emit('choose', {
                          id: candidate.id,
                          type: candidate.resourceType ?? candidate.source,
                          label: candidate.label
                        })">{{ t('mapping.authority.take') }}</button>
              </div>
            </template>
          </div>

          <div class="modal-foot">
            <button type="button" class="btn btn-outline btn-sm" @click="emit('choose', { id: '', type: '' })">
              {{ t('mapping.authority.leaveOpen') }}
            </button>
            <button type="button" class="btn btn-outline btn-sm" @click="emit('close')">
              {{ t('mapping.authority.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </ClientOnly>
</template>
