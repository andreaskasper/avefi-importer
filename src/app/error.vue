<script setup lang="ts">
/**
 * Fehlerseite fuer alles, was keine Seite hat: 404, 403 und der Rest.
 *
 * Jeder Fall bekommt seinen eigenen Satz. Ein „Da ist etwas schiefgelaufen"
 * fuer alle drei waere genau die pauschale Meldung, die im PHP-Stand Menschen
 * in die Irre geschickt hat.
 */
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const status = computed(() => Number(props.error?.statusCode ?? 500))
const kind = computed(() => (status.value === 404 ? 'notFound' : status.value === 403 ? 'forbidden' : 'generic'))
const title = computed(() => t(`imports.page.${kind.value}.title`))

useHead({ title: () => title.value })
</script>

<template>
  <div class="auth">
    <div style="text-align:center;max-width:520px">
      <p class="logo"
         style="justify-content:center;font-weight:700;font-size:18px;display:flex;align-items:center;gap:9px;margin-bottom:14px">
        <span class="dot" aria-hidden="true" /> {{ t('auth.hero.brand') }}
      </p>
      <h1 style="font-size:64px;letter-spacing:-.03em">{{ status }}</h1>
      <p class="fn" style="font-size:16px;margin-top:6px">{{ title }}</p>
      <p class="dim" style="margin-top:6px">{{ t(`imports.page.${kind}.text`) }}</p>
      <p v-if="kind === 'generic' && error?.message" class="dim small mono" style="margin-top:10px">
        {{ error.message }}
      </p>
      <p style="margin-top:16px">
        <a class="btn btn-primary" href="/">{{ t('imports.page.notFound.home') }}</a>
      </p>
    </div>
  </div>
</template>
