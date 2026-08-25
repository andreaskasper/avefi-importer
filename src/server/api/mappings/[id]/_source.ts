/*
 * Die im Profil hinterlegte Stichprobe als Quelle fuer den Editor.
 *
 * Ohne Stichprobe kann der Editor keine Vorschau rechnen. Im PHP-Stand fehlte
 * sie in Exporten, und der Editor verweigerte den Dienst mit einer Meldung, die
 * den Grund verschwieg. Deshalb steht hier ein eigener Fehlercode samt Ausweg:
 * eine hochgeladene Tabelle mit derselben Kopfzeile genuegt.
 */
import type { H3Event } from 'h3'
import type { MappingProfileRow } from '#shared/types/domain'
import {
  fail, ownProfile, sourceFromSample, visibleProfile, type TableSource, type UserWithInstitution
} from '../_lib'

export interface ProfileSource {
  user: UserWithInstitution
  profile: MappingProfileRow
  source: TableSource
}

async function withSample(
  loaded: { user: UserWithInstitution; profile: MappingProfileRow }
): Promise<ProfileSource> {
  const { user, profile } = loaded
  const source = sourceFromSample(profile.sample_json, profile.header_hash, profile.base_format)
  if (source === null) {
    throw fail(409, 'no_sample', { id: profile.id, name: profile.name },
      'Fuer dieses Profil ist keine Stichprobe hinterlegt.')
  }
  return { user, profile, source }
}

/** Zum Bearbeiten: nur die besitzende Einrichtung, und nur mit Stichprobe. */
export async function ownProfileSource(event: H3Event): Promise<ProfileSource> {
  return withSample(await ownProfile(event))
}

/** Zum Ansehen: jedes Profil, aber ebenfalls nur mit Stichprobe. */
export async function visibleProfileSource(event: H3Event): Promise<ProfileSource> {
  return withSample(await visibleProfile(event))
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
