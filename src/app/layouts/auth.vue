<script setup lang="ts">
/** Rahmen fuer die Anmeldeseite — ohne Kopfzeile. */
const { t } = useI18n()
function toggleTheme() {
  const root = document.documentElement
  const cur = root.getAttribute('data-theme')
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : prefersDark ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
  try { localStorage.setItem('avefi-theme', next) } catch { /* Speicher gesperrt */ }
}
</script>

<template>
  <div class="auth-page">
    <slot />
    <button class="ghost" :title="t('theme.switch')" :aria-label="t('theme.switch')"
            style="position:fixed;top:16px;right:16px" @click="toggleTheme">◐ {{ t('theme.label') }}</button>
  </div>
</template>
