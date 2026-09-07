/*
 * Importe: Hochladen, Stand, Loeschen, Neu konvertieren, Ausgabedateien.
 *
 * Die Antwortformen liegen zum groessten Teil schon in
 * app/components/imports/types.ts und werden von dort weitergereicht — was
 * hier dazukam, sind die beiden Formen, die einzelne Seiten selbst
 * deklarierten.
 */
import type { EditorPayload } from '~/components/mapping/types'

export interface ImportMappingResponse {
  import: { id: string; filename: string; status: string; base_format: string | null }
  payload: EditorPayload
}

export interface BlattAuswahlAntwort {
  ids: string[]
}

export function importsService(): {
  listePfad: () => string
  standPfad: () => string
  einerPfad: (id: string) => string
  berichtPfad: (id: string) => string
  datensaetzePfad: (id: string) => string
  blaetterPfad: (id: string) => string
  zuordnungPfad: (id: string) => string
  originalPfad: (id: string) => string
  avefiJsonPfad: (id: string) => string
  hochladenPfad: (dateiname: string) => string
  loeschen: (id: string) => Promise<unknown>
  neuKonvertieren: (id: string) => Promise<unknown>
  vonAdresse: (url: string) => Promise<unknown>
  blaetterWaehlen: (id: string, sheets: string[]) => Promise<BlattAuswahlAntwort>
} {
  const api = useApi()
  return {
    listePfad: () => api('/imports'),
    standPfad: () => api('/imports/status'),
    einerPfad: (id) => api(`/imports/${id}`),
    berichtPfad: (id) => api(`/imports/${id}/report`),
    datensaetzePfad: (id) => api(`/imports/${id}/records`),
    blaetterPfad: (id) => api(`/imports/${id}/sheets`),
    zuordnungPfad: (id) => api(`/imports/${id}/mapping`),
    originalPfad: (id) => api(`/imports/${id}/original`),
    avefiJsonPfad: (id) => api(`/imports/${id}/avefi.json`),
    // Der Upload laeuft ueber XMLHttpRequest, weil nur der einen Fortschritt
    // meldet; deshalb hier nur die Adresse.
    hochladenPfad: (dateiname) => api(`/imports/upload?name=${encodeURIComponent(dateiname)}`),
    loeschen: (id) => $fetch(api(`/imports/${id}`), { method: 'DELETE' }),
    neuKonvertieren: (id) => $fetch(api(`/imports/${id}/reconvert`), { method: 'POST' }),
    vonAdresse: (url) => $fetch(api('/imports/url'), { method: 'POST', body: { url } }),
    blaetterWaehlen: (id, sheets) =>
      $fetch<BlattAuswahlAntwort>(api(`/imports/${id}/sheets`), { method: 'POST', body: { sheets } })
  }
}
