/*
 * PATCH /api/mappings/:id — Profil umbenennen.
 *
 * Umbenennen erzeugt keine neue Fassung: Der Name ist keine Zuordnung, und ein
 * Verlaufseintrag ohne inhaltliche Aenderung waere nur Rauschen.
 */
import { db } from '../../../db'
import { fail, noStore, ownProfile, renameProfile } from '../_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { profile } = await ownProfile(event)
  const body = (await readBody(event)) as { name?: unknown }
  const name = String(body?.name ?? '').trim()
  if (name === '') throw fail(400, 'no_name', {}, 'Kein Name angegeben.')
  if (name.length > 200) throw fail(400, 'name_too_long', { max: 200 }, 'Name zu lang.')

  await renameProfile(db(), profile.id, name)
  return { profile: { id: profile.id, name, version: profile.version, complete: profile.complete } }
})
