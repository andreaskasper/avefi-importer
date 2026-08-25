/*
 * Ablage der Importdateien unter FILES_PATH (Vorgabe /mnt/files).
 *
 * Aufbau je Import:
 *   <base>/<import-uuid>/org/<Originaldatei>     unveraendert, wie hochgeladen
 *   <base>/<import-uuid>/work/<Blatt>.csv        abgeleitet (Excel-Blatt)
 *   <base>/<import-uuid>/avefi.v1.json           Ergebnis der Konvertierung
 *
 * Schreibvorgaenge werden geprueft. Im PHP-Stand liefen copy() und
 * file_put_contents() mit vorangestelltem @, und der Rueckgabewert wurde nicht
 * ausgewertet. Ergebnis im Dateibestand: ein Import mit Status "konvertiert"
 * und 2738 Datensaetzen, dessen avefi.v1.json 0 Byte gross ist
 * (a61132af-cb2b-4714-a830-e3c3301e008a). Eine leere Lieferdatei bei
 * gemeldetem Erfolg ist der schlimmste denkbare Ausgang; deshalb wirft hier
 * jeder fehlgeschlagene Schreibvorgang.
 */
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, open as fsOpen, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export function filesBase(): string {
  const p = process.env.FILES_PATH
  return (p && p !== '' ? p : '/mnt/files').replace(/\/+$/, '')
}

export function importDir(id: string): string {
  return join(filesBase(), id)
}

export function orgDir(id: string): string {
  return join(importDir(id), 'org')
}

export function workDir(id: string): string {
  return join(importDir(id), 'work')
}

export function avefiPath(id: string, version = 1): string {
  return join(importDir(id), `avefi.v${version}.json`)
}

/**
 * Sicherer Dateiname: keine Pfadanteile, keine versteckten Dateien, keine
 * Zeichen ausserhalb von Buchstaben, Ziffern, Punkt, Strich und Unterstrich.
 * Umlaute bleiben erhalten, weil Dateinamen sonst unlesbar werden.
 */
export function sanitizeFilename(name: string): string {
  let out = name.replace(/\\/g, '/')
  out = out.slice(out.lastIndexOf('/') + 1)
  out = out.replace(/[^\p{L}\p{N}._-]+/gu, '_')
  out = out.replace(/^\.+/, '')
  if (out === '') out = 'datei'
  if (out.length > 180) {
    const dot = out.lastIndexOf('.')
    const ext = dot > 0 ? out.slice(dot) : ''
    out = out.slice(0, 150) + ext
  }
  return out
}

async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o775 })
  return dir
}

/** Stellt org/ bereit und liefert den Zielpfad fuer einen bereinigten Dateinamen. */
export async function prepareOrg(id: string, filename: string): Promise<string> {
  await ensureDir(orgDir(id))
  return join(orgDir(id), sanitizeFilename(filename))
}

/** Stellt work/ bereit und liefert den Zielpfad. */
export async function prepareWork(id: string, filename: string): Promise<string> {
  await ensureDir(workDir(id))
  return join(workDir(id), sanitizeFilename(filename))
}

/** Legt einen Datenstrom als Originaldatei ab und liefert Name und Groesse. */
export async function storeOriginalStream(
  id: string,
  source: Readable,
  originalName: string
): Promise<{ filename: string; size: number }> {
  const filename = sanitizeFilename(originalName)
  const dest = await prepareOrg(id, filename)
  await pipeline(source, createWriteStream(dest, { mode: 0o664 }))
  const info = await stat(dest)
  if (info.size === 0) throw new Error('Die gespeicherte Datei ist leer.')
  return { filename, size: info.size }
}

/** Legt einen Puffer als Originaldatei ab. */
export async function storeOriginalBuffer(
  id: string,
  data: Uint8Array,
  originalName: string
): Promise<{ filename: string; size: number }> {
  const filename = sanitizeFilename(originalName)
  const dest = await prepareOrg(id, filename)
  await writeFile(dest, data, { mode: 0o664 })
  const info = await stat(dest)
  if (info.size !== data.byteLength) {
    throw new Error(`Datei unvollstaendig geschrieben (${info.size} von ${data.byteLength} Byte).`)
  }
  return { filename, size: info.size }
}

/** Pfad der ersten Datei im angegebenen Verzeichnis oder null. */
async function firstFileIn(dir: string): Promise<string | null> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort()
  const first = files[0]
  return first === undefined ? null : join(dir, first)
}

/** Pfad der Originaldatei eines Imports oder null. */
export async function firstOrgFile(id: string): Promise<string | null> {
  return firstFileIn(orgDir(id))
}

/**
 * Die Tabelle, mit der gearbeitet wird: das herausgeloeste Blatt, falls
 * vorhanden, sonst die Originaldatei. Der Rest der Anwendung sieht damit immer
 * eine Tabelle, gleich ob eine CSV hochgeladen oder ein Blatt gewaehlt wurde.
 */
export async function tableFile(id: string): Promise<string | null> {
  return (await firstFileIn(workDir(id))) ?? (await firstOrgFile(id))
}

/** Kopiert die Originaldatei eines Imports in einen anderen (weitere Blaetter). */
export async function copyOriginal(fromId: string, toId: string): Promise<string | null> {
  const src = await firstOrgFile(fromId)
  if (src === null) return null
  const name = src.slice(src.lastIndexOf('/') + 1)
  const dest = await prepareOrg(toId, name)
  await copyFile(src, dest)
  return dest
}

/**
 * Schreibt avefi.v1.json und prueft danach die Groesse. Geprueft wird, weil
 * genau dieser Schreibvorgang im Altstand unbemerkt fehlschlagen konnte.
 */
export async function writeAvefi(id: string, nodes: unknown[], version = 1): Promise<number> {
  await ensureDir(importDir(id))
  const path = avefiPath(id, version)
  const json = JSON.stringify(nodes, null, 2)
  await writeFile(path, json, { encoding: 'utf8', mode: 0o664 })
  const info = await stat(path)
  if (info.size !== Buffer.byteLength(json, 'utf8')) {
    throw new Error(`avefi.v${version}.json unvollstaendig geschrieben (${info.size} Byte).`)
  }
  return info.size
}

/** Reicht eine bereits native AVefi-Datei unveraendert durch. */
export async function copyAsAvefi(id: string, sourcePath: string, version = 1): Promise<number> {
  await ensureDir(importDir(id))
  const dest = avefiPath(id, version)
  await copyFile(sourcePath, dest)
  const src = await stat(sourcePath)
  const out = await stat(dest)
  if (out.size !== src.size) {
    throw new Error(`avefi.v${version}.json unvollstaendig kopiert (${out.size} von ${src.size} Byte).`)
  }
  return out.size
}

/** Loescht das komplette Importverzeichnis. */
export async function deleteImportFiles(id: string): Promise<void> {
  await rm(importDir(id), { recursive: true, force: true })
}

/**
 * Schreibt avefi.v1.json im Datenstrom.
 *
 * Bei einer Lieferung mit dreihunderttausend Zeilen darf die Ausgabedatei nicht
 * erst vollstaendig im Speicher entstehen. Am Ende wird die Groesse geprueft —
 * aus demselben Grund wie bei writeAvefi().
 */
export class AvefiWriter {
  private readonly stream: ReturnType<typeof createWriteStream>
  private count = 0
  private closed = false

  private constructor(private readonly path: string) {
    this.stream = createWriteStream(path, { encoding: 'utf8', mode: 0o664 })
    this.stream.write('[')
  }

  static async open(id: string, version = 1): Promise<AvefiWriter> {
    await ensureDir(importDir(id))
    return new AvefiWriter(avefiPath(id, version))
  }

  async write(nodes: readonly unknown[]): Promise<void> {
    for (const node of nodes) {
      const text = (this.count === 0 ? '\n  ' : ',\n  ') + JSON.stringify(node)
      if (!this.stream.write(text)) {
        await new Promise<void>((resolve) => this.stream.once('drain', () => resolve()))
      }
      this.count++
    }
  }

  /** Schliesst die Datei und liefert die Groesse in Byte. */
  async close(): Promise<{ nodes: number; size: number }> {
    if (this.closed) throw new Error('Die Ausgabedatei ist bereits geschlossen.')
    this.closed = true
    await new Promise<void>((resolve, reject) => {
      this.stream.end(this.count === 0 ? ']\n' : '\n]\n', () => resolve())
      this.stream.once('error', reject)
    })
    const info = await stat(this.path)
    if (info.size === 0) throw new Error('avefi.v1.json wurde leer geschrieben.')
    return { nodes: this.count, size: info.size }
  }
}

/** Liest die ersten Bytes einer Datei — fuer die Formaterkennung am Dateianfang. */
export async function readHeadBytes(path: string, bytes = 4096): Promise<Buffer> {
  const fh = await fsOpen(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}
