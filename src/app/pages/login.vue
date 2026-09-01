<script setup lang="ts">
/**
 * Anmeldung.
 *
 * Fehlgeschlagene Anmeldungen nennen nicht, ob die Adresse bekannt ist —
 * sonst laesst sich mit dem Formular herausfinden, wer ein Konto hat. Alles
 * andere bekommt einen eigenen Satz: ein nicht erreichbarer Dienst ist etwas
 * anderes als ein falsches Passwort.
 */
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const { login } = useAuth()
const keepFocus = useKeepFocus()
const route = useRoute()

useHead({ title: () => t('auth.pageTitle') })

const email = ref('')
const password = ref('')
const busy = ref(false)
const errorKey = ref<string | null>(null)
const errorText = computed(() => (errorKey.value === null ? '' : t(`auth.error.${errorKey.value}`)))

async function submit() {
  return keepFocus(() => submitInner())
}

async function submitInner() {
  errorKey.value = null
  if (email.value.trim() === '' || password.value === '') {
    errorKey.value = 'empty'
    return
  }
  busy.value = true
  try {
    await login(email.value.trim(), password.value)
    const next = String(route.query.next ?? '/')
    // Nur Ziele innerhalb der Anwendung — sonst laesst sich ueber ?next= auf
    // eine fremde Seite umleiten.
    await navigateTo(next.startsWith('/') && !next.startsWith('//') ? next : '/')
  } catch (e) {
    const status = Number((e as { statusCode?: number; status?: number }).statusCode ?? (e as { status?: number }).status ?? 0)
    errorKey.value = status === 401 ? 'failed' : status === 0 ? 'network' : 'unexpected'
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main id="main" class="auth">
    <div class="login-card">
      <div class="login-wrap">
        <div class="login-hero">
          <div class="net" aria-hidden="true" />
          <div class="k">
            <p class="logo" style="color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;gap:9px">
              <span class="dot" aria-hidden="true" /> {{ t('auth.hero.brand') }}
            </p>
          </div>
          <div class="k">
            <p style="font-size:26px;letter-spacing:-.02em;font-weight:700;line-height:1.2">
              {{ t('auth.hero.claim1') }}<br>{{ t('auth.hero.claim2') }}
            </p>
            <p class="lead">{{ t('auth.hero.lead') }}</p>
          </div>
          <ul>
            <li>{{ t('auth.hero.f1') }}</li>
            <li>{{ t('auth.hero.f2') }}</li>
            <li>{{ t('auth.hero.f3') }}</li>
          </ul>
        </div>

        <form class="login-form" autocomplete="on" @submit.prevent="submit">
          <div>
            <span class="login-logo"><img src="/av-efi-logo.svg" alt="AV-EFI" width="150" height="58"></span>
            <h1 style="font-size:19px;margin-top:14px">{{ t('auth.heading') }}</h1>
            <p class="dim small" style="margin:4px 0 6px">{{ t('auth.intro') }}</p>
          </div>

          <div class="live-region" role="alert" aria-live="assertive">
            <div v-if="errorKey !== null" class="ui-alert">{{ errorText }}</div>
          </div>

          <div class="field">
            <label for="email">{{ t('auth.email') }}</label>
            <input id="email" v-model="email" class="ui-input" type="email" name="email" autocomplete="username"
                   :placeholder="t('auth.emailPlaceholder')" required autofocus
                   :aria-invalid="errorKey !== null ? 'true' : undefined">
          </div>

          <div class="field">
            <label for="password">{{ t('auth.password') }}</label>
            <input id="password" v-model="password" class="ui-input" type="password" name="password"
                   autocomplete="current-password" :placeholder="t('auth.passwordPlaceholder')" required
                   :aria-invalid="errorKey !== null ? 'true' : undefined">
          </div>

          <button class="btn btn-primary" type="submit" style="justify-content:center;padding:11px" :disabled="busy">
            {{ busy ? t('auth.submitting') : t('auth.submit') }}
          </button>

          <div class="ui-divider">{{ t('auth.or') }}</div>
          <p class="sso" :title="t('auth.ssoHint')">
            <span class="dot" style="box-shadow:none" aria-hidden="true" /> {{ t('auth.sso') }}
            <span class="sr-only">— {{ t('auth.ssoHint') }}</span>
          </p>
          <p class="note">{{ t('auth.note') }}</p>
        </form>
      </div>
    </div>
  </main>
</template>
