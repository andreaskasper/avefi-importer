/*
 * PUT /api/imports/:id/records/:recordId — einen bearbeiteten Datensatz speichern.
 *
 * Drei Dinge passieren hier und nirgends sonst:
 *
 *  1. records.edited_at wird gesetzt (saveRecord tut das). Nur so kann die
 *     Importliste vor dem Neu-Konvertieren die tatsaechliche Zahl betroffener
 *     Datensaetze nennen, statt zu raten.
 *  2. Die Herkunftsangabe aus data_json bleibt erhalten — sie gehoert zur
 *     Nachvollziehbarkeit und darf durch eine Handbearbeitung nicht verschwinden.
 *  3. Geprueft wird beim Dienst efi-conv, nicht hier. Gespeichert wird trotzdem:
 *     Ein Zwischenstand, der noch nicht schemakonform ist, muss sich sichern
 *     lassen, sonst geht Arbeit verloren. Die Beanstandungen kommen mit zurueck.
 */
import { z } from 'zod'
import type { AvefiNode } from '#shared/types/domain'
import { db } from '../../../../db'
import { findRecord, saveRecord } from '../../../../lib/records'
import { completenessIssues, coreScore, ringClass } from '../../../../lib/mapping/index'
import type { SaveResponse } from '#shared/types/domain'
import { checkRecords } from '../../../../worker/validate'
import { fail, ownedImport } from '../../_lib'
import { authorityInNameIssues, canonicalOf, sourceOf } from '../../../records/_record'

const Node = z.record(z.string(), z.unknown())

const Body = z.object({
  work: Node,
  manifestations: z.array(Node).default([]),
  items: z.array(Node).default([])
})

export default defineEventHandler(async (event): Promise<SaveResponse> => {
  const { row } = await ownedImport(event)

  const recordId = Number(getRouterParam(event, 'recordId'))
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw fail(404, 'record_not_found', {}, 'Datensatz nicht gefunden.')
  }

  const sql = db()
  const existing = await findRecord(sql, recordId, row.id)
  if (existing === null) throw fail(404, 'record_not_found', {}, 'Datensatz nicht gefunden.')

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'record_malformed', {}, 'Datensatz nicht lesbar.')

  const work = parsed.data.work as AvefiNode
  if (Object.keys(work).length === 0) {
    throw fail(400, 'record_no_work', {}, 'Ohne Werk gibt es keinen Datensatz.')
  }
  // Die Kategorie ist die einzige Angabe, die der Server setzt: Ohne sie
  // findet weder der Export noch die Liste den Knoten wieder.
  work.category = 'avefi:WorkVariant'
  const manifestations = (parsed.data.manifestations as AvefiNode[]).map((m) => ({ ...m, category: 'avefi:Manifestation' }))
  const items = (parsed.data.items as AvefiNode[]).map((i) => ({ ...i, category: 'avefi:Item' }))

  const record = { work, manifestations, items }

  await saveRecord(sql, recordId, row.id, {
    work,
    manifestations,
    items,
    source: sourceOf(existing, row.filename)
  })

  const saved = await findRecord(sql, recordId, row.id)
  const stored = saved === null ? canonicalOf(existing) : canonicalOf(saved)

  const nodes = [work, ...manifestations, ...items] as Record<string, unknown>[]
  const check = await checkRecords(nodes, {}, 20_000)

  return {
    ok: true,
    completeness: saved?.completeness ?? existing.completeness,
    core: coreScore(record),
    ring: ringClass(saved?.completeness ?? existing.completeness),
    editedAt: saved?.edited_at ?? null,
    title: saved?.work_title ?? null,
    avefi: stored,
    checked: check.checked,
    valid: check.valid,
    issues: [...check.issues, ...authorityInNameIssues(record)],
    unavailable: check.unavailable,
    hints: completenessIssues(record)
  }
})
