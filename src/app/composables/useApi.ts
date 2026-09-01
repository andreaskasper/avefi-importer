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
 */
export function useApi(): (path: string) => string {
  const configured = useRuntimeConfig().public.apiBase
  const base = (typeof configured === 'string' && configured !== '' ? configured : '/api').replace(/\/+$/, '')
  return (path: string): string => `${base}${path.startsWith('/') ? path : `/${path}`}`
}
