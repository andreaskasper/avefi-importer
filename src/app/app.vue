<script setup lang="ts">
// Die Sprache des Dokuments muss der Sprache der Oberflaeche folgen. Stand sie
// fest auf "de", las ein Screenreader die englische Fassung mit deutscher
// Aussprache vor. nuxt.config setzt nur den Anfangswert.
const { locale } = useI18n()

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
</template>
