<script setup lang="ts">
/**
 * Einzelheiten zu einer Normdaten-Kennung.
 *
 * Damit sich eine Zuordnung pruefen laesst, bevor sie bestaetigt wird — und
 * damit hinterher nachvollziehbar bleibt, wer da eigentlich verknuepft wurde.
 */
import type { AuthorityDetailResponse } from './types'

const props = defineProps<{ source: string; id: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const loading = ref(true)
const data = ref<AuthorityDetailResponse | null>(null)
const box = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let returnTo: HTMLElement | null = null

async function load() {
  loading.value = true
  data.value = await $fetch<AuthorityDetailResponse>('/api/records/authority/detail', {
    query: { source: props.source, id: props.id }
  }).catch(() => null)
  loading.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
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

onMounted(async () => {
  returnTo = document.activeElement as HTMLElement | null
  document.addEventListener('keydown', onKeydown, true)
  await load()
  await nextTick()
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  returnTo?.focus()
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div class="modal-overlay" @click.self="emit('close')">
        <div ref="box" class="modal-box detail-box" role="dialog" aria-modal="true"
             aria-labelledby="authority-detail-title">
          <div class="modal-head">
            <h3 id="authority-detail-title">
              {{ data && data.detail.title ? data.detail.title : t('records.editor.authority.detailHeading') }}
            </h3>
            <button ref="closeButton" type="button" class="modal-x"
                    :aria-label="t('records.editor.authority.detailClose')"
                    @click="emit('close')">×</button>
          </div>
          <div class="modal-body">
            <p v-if="loading" class="dim">{{ t('records.editor.authority.detailLoading') }}</p>
            <div v-else-if="data && data.found" class="detail-content">
              <img v-if="data.detail.image" :src="data.detail.image" alt="" class="detail-img" referrerpolicy="no-referrer">
              <p v-if="data.detail.description" class="detail-desc">{{ data.detail.description }}</p>
              <p v-if="data.detail.extract" class="detail-extract">{{ data.detail.extract }}</p>
              <p class="note mono">{{ source }} · {{ id }}</p>
            </div>
            <p v-else class="dim">{{ t('records.editor.authority.detailNone') }}</p>
          </div>
          <div class="modal-foot">
            <a v-if="data && data.detail.wikiUrl" class="btn btn-outline btn-sm" :href="data.detail.wikiUrl"
               target="_blank" rel="noopener">{{ t('records.editor.authority.openWikipedia') }}</a>
            <a v-if="data && data.detail.url" class="btn btn-outline btn-sm" :href="data.detail.url"
               target="_blank" rel="noopener">{{ t('records.editor.authority.openSource') }}</a>
            <button type="button" class="btn btn-primary btn-sm" @click="emit('close')">
              {{ t('records.editor.close') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </ClientOnly>
</template>
