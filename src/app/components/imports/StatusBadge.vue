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

/*
 * Die Erklaerung haengt als Beschreibung am Abzeichen, nicht als sein Name.
 *
 * Vorher stand sie in `aria-label` auf einem <span>. Ein <span> ohne Rolle ist
 * `generic`, und dort ist ein Name unzulaessig: Vorlesewerkzeuge ignorieren ihn
 * entweder — dann ist die Erklaerung fuer sie gar nicht da — oder sie lesen ihn
 * *statt* des sichtbaren Wortes „veraltet". Dann heisst das Abzeichen anders,
 * als es aussieht, und wer die Oberflaeche mit der Stimme bedient, findet es
 * unter seiner Beschriftung nicht mehr (WCAG 2.5.3, Label in Name).
 *
 * Jetzt steht die Erklaerung als sichtbar verborgener Text neben dem Abzeichen.
 * `aria-describedby` waere die elegantere Loesung gewesen und wurde verworfen,
 * weil sie hier nichts tut: Ein <span> ohne Rolle steht gar nicht als eigener
 * Knoten im Barrierebaum, eine Beschreibung daran geht also ins Leere. Gepruef
 * im Barrierebaum von Chromium, nicht angenommen.
 *
 * Der Preis ist Umstaendlichkeit — die Erklaerung gehoert jetzt zum Text der
 * Tabellenzelle und wird beim Durchgehen mitgelesen. Das ist der Zustand davor
 * wert: Dort stand sie nur im `title`, und ein `title` ist mit der Tastatur
 * nicht erreichbar. Fuer die Maus bleibt er als Kurzhinweis stehen.
 */
</script>

<template>
  <span class="badgeset">
    <span class="badge" :class="cls"><span class="bd" aria-hidden="true" />{{ label }}</span>
    <template v-if="stale">
      <span class="badge b-warn" :title="staleTitle">
        <span class="bd" aria-hidden="true" />{{ t('imports.status.stale') }}
      </span>
      <span class="sr-only">{{ staleTitle }}</span>
    </template>
  </span>
</template>
