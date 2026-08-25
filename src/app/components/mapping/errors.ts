/*
 * Fehler der Mapping-Endpunkte in einen Satz uebersetzen.
 *
 * Jeder Endpunkt liefert in data.code eine Kennung; daraus wird ein eigener
 * Text. Eine Sammelmeldung waere kein Platzhalter, sondern ein
 * Fehlerverstaerker: Im PHP-Stand stand hinter jedem Fehlschlag derselbe Satz,
 * und wer ein Profil ohne Stichprobe oeffnete, erfuhr nie, dass eine
 * hochgeladene Tabelle gereicht haette.
 */
export interface MappingFailure {
  code: string
  params: Record<string, unknown>
  status: number
}

interface FetchLikeError {
  statusCode?: number
  status?: number
  data?: { data?: Record<string, unknown>; statusMessage?: string; message?: string }
}

export function mappingFailure(e: unknown): MappingFailure {
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

/** Satz zu einer Kennung; ohne eigenen Schluessel bleibt nur der Ersatzsatz. */
export function failureText(t: Translate, te: Exists, failure: MappingFailure | null): string {
  if (failure === null) return ''
  const key = `mapping.error.${failure.code}`
  return te(key) ? t(key, failure.params) : t('mapping.error.unexpected')
}
