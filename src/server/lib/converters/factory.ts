/*
 * converter_key -> Konverter.
 *
 * Der Schluessel steht in format_profiles.converter_key bzw. bei Tabellen als
 * "mapping_profile:<id>" im Job. Er bleibt stabil, damit ein Import
 * wiederholbar ist.
 */
import type { BaseFormat } from '#shared/types/domain'
import type { Converter } from './types'
import { AvefiJsonConverter, AVEFI_JSON_KEY } from './avefiJson'
import { GenericJsonConverter, GENERIC_JSON_KEY } from './genericJson'
import { MarcXmlConverter, MARCXML_KEY } from './marcXml'
import { EadConverter, EAD_KEY } from './ead'
import { ProfileTableConverter, profileIdFromKey, type ProfileForRun } from './profileTable'

/** Direkt vorhandene Konverter mit ihrer Bezeichnung. */
export const CONVERTER_LABELS: Record<string, string> = {
  [AVEFI_JSON_KEY]: 'AVefi (nativ)',
  [GENERIC_JSON_KEY]: 'Generisch (JSON)',
  [MARCXML_KEY]: 'MARC-XML',
  [EAD_KEY]: 'EAD'
}

export function converterLabel(key: string, profileName?: string): string {
  const id = profileIdFromKey(key)
  if (id !== null) return profileName ? `Mappingprofil: ${profileName}` : 'Mappingprofil'
  return CONVERTER_LABELS[key] ?? key
}

export type ProfileForConverter = ProfileForRun

export interface MakeOptions {
  baseFormat?: BaseFormat | null
  /** Wird gebraucht, sobald der Schluessel auf ein Mappingprofil zeigt. */
  profile?: ProfileForConverter | null
}

export function makeConverter(key: string, opts: MakeOptions = {}): Converter | null {
  const profileId = profileIdFromKey(key)
  if (profileId !== null) {
    if (!opts.profile || opts.profile.id !== profileId) return null
    return new ProfileTableConverter(opts.profile, opts.baseFormat ?? null)
  }
  switch (key) {
    case AVEFI_JSON_KEY:
      return new AvefiJsonConverter()
    case GENERIC_JSON_KEY:
      return new GenericJsonConverter()
    case MARCXML_KEY:
      return new MarcXmlConverter()
    case EAD_KEY:
      return new EadConverter()
    default:
      return null
  }
}
