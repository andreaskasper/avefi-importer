<script setup lang="ts">
// Die Sprache des Dokuments muss der Sprache der Oberflaeche folgen. Stand sie
// fest auf "de", las ein Screenreader die englische Fassung mit deutscher
// Aussprache vor. nuxt.config setzt nur den Anfangswert.
const { locale } = useI18n()

/**
 * Seitenwechsel hoerbar machen.
 *
 * Eine Einzelseitenanwendung tauscht nur den Inhalt aus. Ohne Zutun bleibt der
 * Fokus dabei am Dokumentanfang und niemand erfaehrt, dass sich etwas geaendert
 * hat. Nach jedem Wechsel wandert der Fokus deshalb an den Anfang des
 * Inhaltsbereichs und der neue Seitentitel wird angesagt.
 */
const seitenwechsel = ref('')
const router = useRouter()

if (import.meta.client) {
  router.afterEach((nach, von) => {
    if (nach.path === von.path) return
    void nextTick(() => {
      window.setTimeout(() => {
        const ziel = document.getElementById('main')
        if (ziel !== null) {
          ziel.setAttribute('tabindex', '-1')
          ziel.focus({ preventScroll: false })
        }
        seitenwechsel.value = document.title
      }, 180)
    })
  })
}

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: (t?: string) => (t ? `${t} · AVefi Importer` : 'AVefi Importer'),
  meta: [{ name: 'robots', content: 'noindex' }],
  script: [{
    // Design frueh anwenden, damit es beim Laden nicht flackert.
    innerHTML: `(function(){try{var t=localStorage.getItem("avefi-theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
    tagPosition: 'head'
  }]
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <p class="sr-only" role="status" aria-live="polite">{{ seitenwechsel }}</p>
</template>
