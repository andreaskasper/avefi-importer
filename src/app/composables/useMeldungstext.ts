/*
 * Saetze aus Codes bauen, an einer Stelle.
 *
 * Der Mappingkern schickt seit dem 07.09.2026 Codes und Bausteine. Drei
 * Stellen zeigen sie an — der Pruefbereich, die Beispielzeile im
 * Zuordnungseditor und die Zweigansicht — und drei Kopien derselben acht
 * Zeilen waeren drei Gelegenheiten, dass eine davon zurueckbleibt.
 *
 * Fehlt eine Uebersetzung, gewinnt der mitgereiste deutsche Satz. Ein Code
 * in der Oberflaeche waere schlechter als ein Satz in der falschen Sprache.
 */
import type { CompletenessHint, MappingMessage } from '#shared/types/domain'

export function useMeldungstext(): {
  meldung: (m: MappingMessage) => string
  hinweis: (h: CompletenessHint) => string
} {
  const { t, te } = useI18n()

  function meldung(m: MappingMessage): string {
    const key = `mapping.checkMsg.${String(m.code).replace(/[.-]/g, '_')}`
    if (!te(key)) return m.text ?? m.code
    return t(key, { ...(m.params ?? {}) })
  }

  function hinweis(h: CompletenessHint): string {
    // hint.noItem -> records.hint.noItem
    const key = `records.${h.code}`
    return te(key) ? t(key) : h.text
  }

  return { meldung, hinweis }
}
