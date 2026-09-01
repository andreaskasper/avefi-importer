/*
 * Basis der API-Aufrufe.
 *
 * Die Anlage zur Frontend-Kompatibilitaet verlangt eine konfigurierbare
 * API-Basis-URL und keine fest verdrahteten Abhaengigkeiten von einer
 * bestimmten Domain. `runtimeConfig.public.apiBase` war dafuer vorgesehen,
 * wurde aber von keiner Zeile gelesen: rund fuenfzig Aufrufe standen mit
 * festem `/api/...` in zwanzig Dateien. Solange der Importer unter derselben
 * Herkunft laeuft wie sein Server, faellt das nicht auf — sobald er hinter
 * einem fremden Frontend oder unter eigener Subdomain steht, schon.
 *
 * Alle Aufrufe gehen deshalb durch diese Funktion. Der Pfad wird ohne `/api`
 * geschrieben; woher die Basis kommt, entscheidet die Konfiguration.
 *
 *   const api = useApi()
 *   await $fetch(api('/imports'))
 *   await useFetch<T>(() => api(`/mappings/${id.value}`))
 *
 * `useRuntimeConfig()` braucht den Nuxt-Kontext und wirft ausserhalb davon —
 * etwa wenn diese Funktion nach einem `await` auf oberster Ebene eines
 * `<script setup>` gerufen wird oder aus einem Ereignisbehandler heraus. Ein
 * Tester hat am 01.09.2026 genau diese Meldung gesehen, waehrend hier
 * ausgerollt wurde. Deshalb wird der Zugriff abgesichert und die einmal
 * gelesene Basis behalten: Sie ist fuer alle Anfragen dieselbe.
 */
let basis: string | null = null

export function useApi(): (path: string) => string {
  if (basis === null) {
    // tryUseNuxtApp() gibt null zurueck statt zu werfen.
    const konfiguriert = tryUseNuxtApp()?.$config?.public?.apiBase
    if (typeof konfiguriert === 'string' && konfiguriert !== '') basis = konfiguriert.replace(/\/+$/, '')
  }
  const base = basis ?? '/api'
  return (path: string): string => `${base}${path.startsWith('/') ? path : `/${path}`}`
}
