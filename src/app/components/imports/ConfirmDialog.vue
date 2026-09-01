<script setup lang="ts">
/**
 * Rueckfrage vor einer Handlung, die sich nicht zuruecknehmen laesst.
 *
 * Tastatur: Escape schliesst, der Fokus wandert beim Oeffnen auf den
 * bestaetigenden Knopf und beim Schliessen dorthin zurueck, wo er herkam.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    okText: string
    danger?: boolean
    busy?: boolean
  }>(),
  { danger: false, busy: false }
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()

const okButton = ref<HTMLButtonElement | null>(null)
const box = ref<HTMLElement | null>(null)
let returnTo: HTMLElement | null = null

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnTo = document.activeElement as HTMLElement | null
      await nextTick()
      okButton.value?.focus()
    } else if (returnTo) {
      returnTo.focus()
      returnTo = null
    }
  }
)

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cancel')
    return
  }
  // Der Fokus bleibt im Dialog: sonst tabbt man hinter die Rueckfrage und
  // bedient eine Seite, die gerade gar nicht bedienbar sein soll.
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
    <div v-if="open" class="ui-modal-overlay" @click.self="emit('cancel')">
      <div ref="box" class="ui-modal-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
           aria-describedby="confirm-text">
        <div class="ui-modal-head">
          <h3 id="confirm-title">{{ title }}</h3>
          <button class="ui-modal-x" type="button" :aria-label="t('imports.confirm.cancel')" @click="emit('cancel')">×</button>
        </div>
        <div id="confirm-text" class="ui-modal-body">{{ message }}</div>
        <div class="ui-modal-foot">
          <button class="btn btn-outline" type="button" @click="emit('cancel')">{{ t('imports.confirm.cancel') }}</button>
          <button ref="okButton" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" type="button"
                  :disabled="busy" @click="emit('confirm')">{{ okText }}</button>
        </div>
      </div>
    </div>
    </Teleport>
  </ClientOnly>
</template>
