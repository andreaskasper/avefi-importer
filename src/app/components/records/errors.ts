/*
 * Fehler der Schnittstelle in einen Satz uebersetzen — fuer Datensaetze und Verwaltung.
 *
 * Wie in components/imports/errors.ts, nur mit mehreren Namensraeumen: Ein
 * Endpunkt dieses Bereichs kann einen Code liefern, der schon unter
 * imports.error steht (etwa not_found). Gesucht wird der Reihe nach; erst wenn
 * kein Namensraum den Code kennt, gibt es den Ersatzsatz.
 *
 * Eine Sammelmeldung waere kein Platzhalter, sondern ein Fehlerverstaerker: Im
 * PHP-Stand stand hinter jedem ?error= derselbe Satz „Das hat nicht geklappt",
 * und ein Tester legte deshalb ein Profil neu an.
 */
export interface ApiFailure {
  code: string
  params: Record<string, unknown>
  status: number
}

interface FetchLikeError {
  statusCode?: number
  status?: number
  data?: { data?: Record<string, unknown>; statusMessage?: string; message?: string }
}

export function apiFailure(e: unknown): ApiFailure {
  const err = (e ?? {}) as FetchLikeError
  const status = Number(err.statusCode ?? err.status ?? 0)
  const payload = err.data?.data
  if (payload && typeof payload.code === 'string') {
    const { code, ...params } = payload
    return { code, params: params as Record<string, unknown>, status }
  }
  if (status === 401) return { code: 'unauthorized', params: {}, status }
  if (status === 403) return { code: 'forbidden', params: {}, status }
  if (status === 404) return { code: 'not_found', params: {}, status }
  if (status === 0) return { code: 'network', params: {}, status }
  return { code: 'unexpected', params: {}, status }
}

type Translate = (key: string, params?: Record<string, unknown>) => string
type Exists = (key: string) => boolean

/**
 * Satz zu einer Kennung. `spaces` nennt die Namensraeume in der Reihenfolge,
 * in der gesucht wird — der erste ist der des aufrufenden Bereichs.
 */
export function failureText(
  t: Translate,
  te: Exists,
  failure: ApiFailure | null,
  spaces: readonly string[] = ['records', 'admin', 'imports']
): string {
  if (failure === null) return ''
  for (const space of spaces) {
    const key = `${space}.error.${failure.code}`
    if (te(key)) return t(key, failure.params)
  }
  const fallback = `${spaces[0] ?? 'records'}.error.unexpected`
  return te(fallback)
    ? t(fallback, { status: failure.status || '—', ...failure.params })
    : `${failure.code} (${failure.status})`
}
