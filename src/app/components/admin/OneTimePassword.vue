<script setup lang="ts">
/**
 * Ein neu erzeugtes Einmalpasswort anzeigen — genau einmal.
 *
 * Es gibt keinen Mailversand, also muss das Passwort hier sichtbar sein. Es
 * steht in keinem Protokoll und laesst sich nicht noch einmal abrufen; das
 * sagt der Text auch, damit niemand das Fenster wegklickt und dann sucht.
 */
const props = defineProps<{ email: string; password: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const copied = ref('')
const box = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let returnTo: HTMLElement | null = null

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = t('admin.users.otp.copied')
  } catch {
    copied.value = t('admin.users.otp.copyFailed')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || box.value === null) return
  const focusable = box.value.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
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
      <div class="modal-overlay">
        <div ref="box" class="modal-box" role="dialog" aria-modal="true" aria-labelledby="otp-title"
             aria-describedby="otp-text">
          <div class="modal-head">
            <h3 id="otp-title">{{ t('admin.users.otp.heading', { email }) }}</h3>
          </div>
          <div class="modal-body">
            <p id="otp-text">{{ t('admin.users.otp.text') }}</p>
            <p class="field">
              <label class="side-h" for="otp-value">{{ t('admin.users.otp.label') }}</label>
              <input id="otp-value" class="input mono" type="text" :value="password" readonly
                     style="font-size:16px;letter-spacing:.06em" @focus="($event.target as HTMLInputElement).select()">
            </p>
            <p v-if="copied !== ''" class="okval" role="status">{{ copied }}</p>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-outline" @click="copy">{{ t('admin.users.otp.copy') }}</button>
            <button ref="closeButton" type="button" class="btn btn-primary" @click="emit('close')">
              {{ t('admin.users.otp.dismiss') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </ClientOnly>
</template>
