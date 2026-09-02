/*
 * Ein Zeitpunkt fuer die Anzeige, ohne Streit zwischen Server und Browser.
 *
 * Der Server kennt die Zeitzone des Betrachters nicht und rechnet in der des
 * Containers (UTC). Formatiert die Seite beim Aufbau in UTC und im Browser in
 * Ortszeit, stimmen beide Durchgaenge nicht ueberein: Vue meldet einen
 * Hydrationsfehler, und fuer einen Moment steht die falsche Uhrzeit da. Am
 * 02.09.2026 auf /users nachgestellt — Server 13:20, Browser 15:20.
 *
 * Deshalb zwei Schritte: beim Aufbau und im ersten Durchgang des Browsers UTC,
 * danach Ortszeit. Genau das tat die Komponente TimeStamp.vue schon, nur
 * konnte sie nichts fuer einen Titel, ein aria-label oder einen
 * Uebersetzungsparameter tun — dort steht Text, keine Komponente. Die Logik
 * liegt jetzt hier, TimeStamp.vue benutzt sie mit.
 */
import { formatDateTime } from '~/components/imports/format'

export function useDateTime(): ComputedRef<(value: string | null | undefined, fallback?: string) => string> {
  const { locale } = useI18n()
  const lokal = ref(false)
  onMounted(() => {
    lokal.value = true
  })
  return computed(() => (value: string | null | undefined, fallback = ''): string => {
    const text = formatDateTime(value, locale.value, lokal.value ? undefined : 'UTC')
    return text === '' ? fallback : text
  })
}
