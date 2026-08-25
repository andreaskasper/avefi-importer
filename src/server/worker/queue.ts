/*
 * Die Warteschlange liegt in Postgres, nicht in Redis und nicht in einem
 * Broker. Ein Auftrag wird mit SELECT … FOR UPDATE SKIP LOCKED geholt: Mehrere
 * Worker koennen nebeneinander laufen, ohne dass zwei denselben Auftrag
 * bekommen, und ohne dass einer auf den anderen wartet.
 *
 * Tabelle worker_jobs, Spalten classname, payload, status (Enum job_status),
 * run_at, attempts.
 */
import type { Sql } from 'postgres'
import type { JobClass, WorkerJobRow } from '#shared/types/domain'

export async function enqueue(
  sql: Sql,
  classname: JobClass,
  payload: Record<string, unknown> = {},
  importId: string | null = null,
  runAt?: Date
): Promise<number> {
  const rows = runAt
    ? await sql<Array<{ id: number }>>`
        INSERT INTO worker_jobs (classname, import_id, payload, run_at)
        VALUES (${classname}, ${importId}, ${sql.json(payload as never)}, ${runAt})
        RETURNING id`
    : await sql<Array<{ id: number }>>`
        INSERT INTO worker_jobs (classname, import_id, payload)
        VALUES (${classname}, ${importId}, ${sql.json(payload as never)})
        RETURNING id`
  const row = rows[0]
  if (!row) throw new Error('Auftrag konnte nicht eingestellt werden.')
  return row.id
}

/**
 * Holt den naechsten faelligen Auftrag und markiert ihn als laufend.
 * Alles in einer Transaktion — zwischen Auswahl und Markierung darf kein
 * anderer Worker dazwischenkommen.
 */
export async function claim(sql: Sql, classname?: JobClass): Promise<WorkerJobRow | null> {
  return sql.begin(async (tx) => {
    const rows = await tx<WorkerJobRow[]>`
      SELECT * FROM worker_jobs
       WHERE status = 'queued'
         AND run_at <= now()
         ${classname === undefined ? tx`` : tx`AND classname = ${classname}`}
       ORDER BY run_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    const job = rows[0]
    if (!job) return null

    await tx`
      UPDATE worker_jobs
         SET status = 'running', started_at = now(), attempts = attempts + 1
       WHERE id = ${job.id}`
    return { ...job, status: 'running' as const, attempts: job.attempts + 1 }
  }) as Promise<WorkerJobRow | null>
}

export async function complete(sql: Sql, id: number): Promise<void> {
  await sql`UPDATE worker_jobs SET status = 'done', finished_at = now(), error = NULL WHERE id = ${id}`
}

export async function fail(sql: Sql, id: number, error: string): Promise<void> {
  await sql`
    UPDATE worker_jobs
       SET status = 'failed', finished_at = now(), error = ${error.slice(0, 2000)}
     WHERE id = ${id}`
}

/** Letzter fehlgeschlagener Auftrag eines Imports — fuer die Fehlerseite. */
export async function lastFailedForImport(
  sql: Sql,
  importId: string
): Promise<Pick<WorkerJobRow, 'classname' | 'error' | 'attempts' | 'finished_at'> | null> {
  const rows = await sql<Array<Pick<WorkerJobRow, 'classname' | 'error' | 'attempts' | 'finished_at'>>>`
    SELECT classname, error, attempts, finished_at
      FROM worker_jobs
     WHERE import_id = ${importId} AND status = 'failed'
     ORDER BY finished_at DESC NULLS LAST, id DESC
     LIMIT 1`
  return rows[0] ?? null
}

/** Aufgeraeumt wird nur, was fertig ist — Fehlgeschlagenes bleibt zum Nachsehen. */
export async function purgeDone(sql: Sql, olderThanDays = 30): Promise<number> {
  const rows = await sql<Array<{ id: number }>>`
    DELETE FROM worker_jobs
     WHERE status = 'done' AND finished_at < now() - ${`${olderThanDays} days`}::interval
     RETURNING id`
  return rows.length
}
