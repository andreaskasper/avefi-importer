/*
 * Die Warteschlange gegen die echte Datenbank. Ohne erreichbare Datenbank
 * werden die Faelle uebersprungen statt fehlzuschlagen — sonst waere ein
 * Testlauf ohne Container ein falscher Alarm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { standaloneDb } from '../../server/db/config'
import { claim, complete, enqueue, fail, lastFailedForImport } from '../../server/worker/queue'

let sql: Sql | null = null
const created: number[] = []

beforeAll(async () => {
  try {
    const candidate = standaloneDb()
    await candidate`SELECT 1`
    sql = candidate
  } catch {
    sql = null
  }
})

afterAll(async () => {
  if (sql === null) return
  if (created.length > 0) await sql`DELETE FROM worker_jobs WHERE id = ANY(${created})`
  await sql.end({ timeout: 5 })
})

async function put(payload: Record<string, unknown>, runAt?: Date): Promise<number> {
  if (sql === null) throw new Error('keine Datenbank')
  const id = await enqueue(sql, 'worker/detect', payload, null, runAt)
  created.push(id)
  return id
}

describe.runIf(process.env.VITEST_DB !== 'off')('Warteschlange', () => {
  it('stellt einen Auftrag ein und holt ihn wieder', async () => {
    if (sql === null) return
    const marker = `test-${Date.now()}-${Math.random()}`
    const id = await put({ marker })

    let found = null
    for (let i = 0; i < 50; i++) {
      const job = await claim(sql, 'worker/detect')
      if (job === null) break
      if ((job.payload as { marker?: string }).marker === marker) {
        found = job
        break
      }
      // Fremde Auftraege wieder freigeben, damit der Worker sie behaelt.
      await sql`UPDATE worker_jobs SET status = 'queued', started_at = NULL, attempts = attempts - 1 WHERE id = ${job.id}`
    }

    expect(found).not.toBeNull()
    expect(found?.id).toBe(id)
    expect(found?.status).toBe('running')
    expect(found?.attempts).toBe(1)

    await complete(sql, id)
    const rows = await sql<Array<{ status: string; finished_at: string | null }>>`
      SELECT status, finished_at FROM worker_jobs WHERE id = ${id}`
    expect(rows[0]?.status).toBe('done')
    expect(rows[0]?.finished_at).not.toBeNull()
  })

  it('holt keinen Auftrag, dessen Zeit noch nicht gekommen ist', async () => {
    if (sql === null) return
    const marker = `spaeter-${Date.now()}`
    const id = await put({ marker }, new Date(Date.now() + 3600_000))

    const rows = await sql<Array<{ n: string }>>`
      SELECT COUNT(*) AS n FROM worker_jobs
       WHERE id = ${id} AND status = 'queued' AND run_at > now()`
    expect(Number(rows[0]?.n)).toBe(1)
  })

  it('haelt einen Fehler samt Meldung fest', async () => {
    if (sql === null) return
    const id = await put({ marker: `fehler-${Date.now()}` })
    await sql`UPDATE worker_jobs SET status = 'running' WHERE id = ${id}`
    await fail(sql, id, 'Die Originaldatei fehlt.')

    const rows = await sql<Array<{ status: string; error: string }>>`
      SELECT status, error FROM worker_jobs WHERE id = ${id}`
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.error).toBe('Die Originaldatei fehlt.')
  })

  it('kuerzt eine sehr lange Fehlermeldung auf 2000 Zeichen', async () => {
    if (sql === null) return
    const id = await put({ marker: `lang-${Date.now()}` })
    await fail(sql, id, 'x'.repeat(5000))
    const rows = await sql<Array<{ error: string }>>`SELECT error FROM worker_jobs WHERE id = ${id}`
    expect(rows[0]?.error.length).toBe(2000)
  })

  it('gibt zu einem Import den letzten fehlgeschlagenen Auftrag zurueck', async () => {
    if (sql === null) return
    const found = await lastFailedForImport(sql, '00000000-0000-0000-0000-000000000000')
    expect(found).toBeNull()
  })

  it('vergibt einen Auftrag nur an einen Abrufer', async () => {
    if (sql === null) return
    const marker = `einmal-${Date.now()}`
    const id = await put({ marker })

    // Zwei Abrufe nacheinander: Der zweite darf denselben Auftrag nicht mehr
    // bekommen, weil er nicht mehr auf 'queued' steht.
    await sql`UPDATE worker_jobs SET status = 'queued' WHERE id = ${id}`
    const first = await sql.begin(async (tx) => {
      const rows = await tx<Array<{ id: number }>>`
        SELECT id FROM worker_jobs WHERE id = ${id} AND status = 'queued'
        FOR UPDATE SKIP LOCKED LIMIT 1`
      if (rows[0]) await tx`UPDATE worker_jobs SET status = 'running' WHERE id = ${id}`
      return rows[0]?.id ?? null
    })
    const second = await sql<Array<{ id: number }>>`
      SELECT id FROM worker_jobs WHERE id = ${id} AND status = 'queued'`

    expect(first).toBe(id)
    expect(second.length).toBe(0)
  })
})
