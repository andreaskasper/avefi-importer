<script setup lang="ts">
/**
 * Verarbeitungsstand als Abzeichen. Farbe aus app.css, Text aus i18n.
 *
 * "Veraltet" ist kein Wert der Datenbank, sondern eine Ableitung: Das Ergebnis
 * stammt aus einer aelteren Fassung des Mappingprofils. Ein gespeicherter
 * Zustand koennte hier luegen, sobald jemand ein Profil aendert, ohne dass
 * Importcode laeuft — der abgeleitete kann es nicht.
 */
import { STATUS_BADGE } from './types'

const props = defineProps<{
  status: string
  /** Ergebnis aus einer aelteren Profilfassung. */
  stale?: boolean
  ranWithVersion?: number | null
  profileVersion?: number | null
}>()
const { t, te } = useI18n()

const cls = computed(() => STATUS_BADGE[props.status] ?? 'b-neutral')
const label = computed(() => {
  const key = `imports.status.${props.status}`
  return te(key) ? t(key) : t('imports.status.unknown')
})

const staleTitle = computed(() => t('imports.status.staleHint', {
  ran: props.ranWithVersion ?? '?',
  now: props.profileVersion ?? '?'
}))
</script>

<template>
  <span class="badgeset">
    <span class="badge" :class="cls"><span class="bd" aria-hidden="true" />{{ label }}</span>
    <span v-if="stale" class="badge b-warn" :title="staleTitle" :aria-label="staleTitle">
      <span class="bd" aria-hidden="true" />{{ t('imports.status.stale') }}
    </span>
  </span>
</template>
