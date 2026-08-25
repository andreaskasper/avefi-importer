<script setup lang="ts">
/** Kurzerklaerung des Ablaufs unter der Liste. */
const { t } = useI18n()
</script>

<template>
  <section class="legend">
    <h2 class="side-h">{{ t("imports.pipeline.heading") }}</h2>
    <div class="flow">
      <span class="step">{{ t('imports.pipeline.s1') }}</span><span class="arr" aria-hidden="true">→</span>
      <span class="step">{{ t('imports.pipeline.s2') }}</span><span class="arr" aria-hidden="true">→</span>
      <span class="step">{{ t('imports.pipeline.s3') }}</span><span class="arr" aria-hidden="true">→</span>
      <span class="step branch">{{ t('imports.pipeline.s4') }}</span><span class="arr" aria-hidden="true">→</span>
      <span class="step">{{ t('imports.pipeline.s5') }}</span><span class="arr" aria-hidden="true">→</span>
      <span class="step">{{ t('imports.pipeline.s6') }}</span>
    </div>
    <p class="note">{{ t('imports.pipeline.note') }}</p>
  </section>
</template>
