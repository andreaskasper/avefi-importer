/*
 * Benannte Felder einer Quelle ohne Mappingprofil in die Zwischenform bringen.
 *
 * Die Zuordnung ist bewusst eine Heuristik ueber Spaltennamen und nur fuer
 * Quellen gedacht, fuer die es kein Profil geben kann (generisches JSON). Fuer
 * Tabellen gibt es Mappingprofile; dort hat diese Heuristik nichts zu suchen.
 */
import type { InternalContributor, InternalRecord } from './types'

const ALIASES: Record<keyof AliasTargets, string[]> = {
  title: ['titel', 'haupttitel', 'originaltitel', 'filmtitel', 'werktitel', 'title', 'maintitle', 'name'],
  year: ['jahr', 'produktionsjahr', 'entstehungsjahr', 'erscheinungsjahr', 'year', 'date', 'datum'],
  workType: ['werkart', 'gattung', 'work_type', 'worktype', 'art', 'kategorie'],
  country: ['land', 'produktionsland', 'country', 'staat'],
  genre: ['genre', 'sujet', 'thema'],
  language: ['sprache', 'language', 'lang', 'fassung'],
  description: ['beschreibung', 'inhalt', 'description', 'abstract', 'summary', 'annotation'],
  director: ['regie', 'regisseur', 'director', 'regiefuehrung'],
  carrier: ['traeger', 'carrier', 'material', 'format', 'filmformat'],
  durationMin: ['laufzeit', 'dauer', 'duration', 'duration_min', 'minuten', 'laenge'],
  signature: ['signatur', 'signature', 'inventarnummer', 'archivnummer', 'identifier', 'id'],
  institution: ['institution', 'archiv', 'besitzer', 'holding_institution', 'einrichtung'],
  location: ['standort', 'location', 'lagerort', 'magazin']
}

interface AliasTargets {
  title: string
  year: string
  workType: string
  country: string
  genre: string
  language: string
  description: string
  director: string
  carrier: string
  durationMin: string
  signature: string
  institution: string
  location: string
}

function pick(fields: Record<string, string>, key: keyof AliasTargets): string | null {
  const names = ALIASES[key]
  for (const [name, value] of Object.entries(fields)) {
    if (names.includes(name.trim().toLowerCase()) && value.trim() !== '') return value.trim()
  }
  return null
}

function toYear(v: string | null): number | null {
  if (v === null) return null
  const m = /(\d{4})/.exec(v)
  return m && m[1] ? Number(m[1]) : null
}

function toMinutes(v: string | null): number | undefined {
  if (v === null) return undefined
  const m = /(\d+)/.exec(v)
  return m && m[1] ? Number(m[1]) : undefined
}

export function fromFlatFields(fields: Record<string, string>, file: string, rowNumber: number): InternalRecord {
  const contributors: InternalContributor[] = []
  const director = pick(fields, 'director')
  if (director !== null) contributors.push({ role: 'Regie', name: director })

  const carrier = pick(fields, 'carrier')
  const durationMin = toMinutes(pick(fields, 'durationMin'))
  const signature = pick(fields, 'signature')
  const institution = pick(fields, 'institution')
  const location = pick(fields, 'location')

  return {
    work: {
      title: pick(fields, 'title'),
      additionalTitles: [],
      year: toYear(pick(fields, 'year')),
      workType: pick(fields, 'workType'),
      country: pick(fields, 'country'),
      genre: pick(fields, 'genre'),
      language: pick(fields, 'language'),
      description: pick(fields, 'description'),
      contributors
    },
    manifestations:
      carrier !== null || durationMin !== undefined
        ? [{ ...(carrier !== null ? { carrier } : {}), ...(durationMin !== undefined ? { durationMin } : {}) }]
        : [],
    items:
      signature !== null || institution !== null || location !== null
        ? [
            {
              ...(signature !== null ? { signature } : {}),
              ...(institution !== null ? { holdingInstitution: institution } : {}),
              ...(location !== null ? { location } : {})
            }
          ]
        : [],
    source: { file, row: rowNumber }
  }
}
