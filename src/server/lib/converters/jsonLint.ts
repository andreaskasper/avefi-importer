/*
 * JSON-Fehler orten.
 *
 * JSON.parse meldet in Node zwar eine Position, aber der Text ist englisch und
 * oft wenig aussagekraeftig ("Unexpected token } in JSON at position 4711").
 * Wer eine 60-MB-Datei aus einem Fachverfahren geliefert bekommt, braucht Zeile,
 * Spalte und einen Satz, der sagt, was zu tun ist. Deshalb wird die Quelle im
 * Fehlerfall — und nur dann — mit einem kleinen Parser nachgelesen.
 */

export interface JsonLocation {
  message: string
  offset: number | null
  line: number | null
  column: number | null
}

class LintError extends Error {
  constructor(message: string, readonly pos: number) {
    super(message)
  }
}

/** null, wenn die Quelle gueltig ist. */
export function locateJsonError(source: string): JsonLocation | null {
  try {
    JSON.parse(source)
    return null
  } catch {
    // weiter unten genauer bestimmen
  }

  const n = source.length
  const state = { p: 0 }
  try {
    skipWs(source, state, n)
    if (state.p >= n) throw new LintError('Die Datei ist leer — es wurde ein JSON-Wert erwartet.', 0)
    readValue(source, state, n)
    skipWs(source, state, n)
    if (state.p < n) throw new LintError('Nach dem JSON-Wert stehen zusaetzliche Zeichen.', state.p)
    // Der Parser sieht keinen Strukturfehler. Dann liegt es an etwas anderem,
    // etwa der Kodierung oder der Schachtelungstiefe.
    return at(source, null, 'Die Datei ist kein gueltiges JSON. Ein Strukturfehler war nicht auffindbar — moeglicherweise liegt es an der Zeichenkodierung.')
  } catch (e) {
    if (e instanceof LintError) return at(source, e.pos, e.message)
    return at(source, null, e instanceof Error ? e.message : String(e))
  }
}

function at(source: string, pos: number | null, message: string): JsonLocation {
  if (pos === null) return { message, offset: null, line: null, column: null }
  const before = source.slice(0, Math.min(pos, source.length))
  const lines = before.split('\n')
  return {
    message,
    offset: pos,
    line: lines.length,
    column: (lines[lines.length - 1] ?? '').length + 1
  }
}

function visible(c: string | undefined): string {
  if (c === undefined) return 'Dateiende'
  if (c === '\n') return 'Zeilenumbruch'
  if (c === '\t') return 'Tabulator'
  return `„${c}“`
}

function skipWs(s: string, st: { p: number }, n: number): void {
  while (st.p < n) {
    const c = s[st.p] as string
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') st.p++
    else break
  }
}

function readValue(s: string, st: { p: number }, n: number): void {
  if (st.p >= n) throw new LintError('Unerwartetes Dateiende — es wurde ein Wert erwartet.', st.p)
  const c = s[st.p] as string
  if (c === '{') return readObject(s, st, n)
  if (c === '[') return readArray(s, st, n)
  if (c === '"') return readString(s, st, n)
  if (c === '-' || (c >= '0' && c <= '9')) return readNumber(s, st, n)
  if (c === 't') return readLiteral(s, st, n, 'true')
  if (c === 'f') return readLiteral(s, st, n, 'false')
  if (c === 'n') return readLiteral(s, st, n, 'null')
  if (c === "'") throw new LintError('JSON erlaubt keine einfachen Anfuehrungszeichen — bitte " verwenden.', st.p)
  throw new LintError(
    `Unerwartetes Zeichen ${visible(c)} — erwartet wurde ein Wert (Objekt, Array, Zeichenkette, Zahl, true/false/null).`,
    st.p
  )
}

function readObject(s: string, st: { p: number }, n: number): void {
  st.p++
  skipWs(s, st, n)
  if (st.p < n && s[st.p] === '}') {
    st.p++
    return
  }
  for (;;) {
    skipWs(s, st, n)
    if (st.p >= n) throw new LintError('Objekt nicht geschlossen — es fehlt „}“.', st.p)
    if (s[st.p] === "'") {
      throw new LintError('JSON erlaubt keine einfachen Anfuehrungszeichen — bitte " verwenden.', st.p)
    }
    if (s[st.p] !== '"') throw new LintError('Objektschluessel muss eine Zeichenkette in "…" sein.', st.p)
    readString(s, st, n)
    skipWs(s, st, n)
    if (st.p >= n || s[st.p] !== ':') throw new LintError('Nach dem Schluessel wird „:“ erwartet.', st.p)
    st.p++
    skipWs(s, st, n)
    readValue(s, st, n)
    skipWs(s, st, n)
    if (st.p >= n) throw new LintError('Objekt nicht geschlossen — es fehlt „}“.', st.p)
    if (s[st.p] === ',') {
      st.p++
      skipWs(s, st, n)
      if (st.p < n && s[st.p] === '}') throw new LintError('Ueberzaehliges Komma vor „}“.', st.p)
      continue
    }
    if (s[st.p] === '}') {
      st.p++
      return
    }
    throw new LintError(`Erwartet „,“ oder „}“ — gefunden ${visible(s[st.p])}.`, st.p)
  }
}

function readArray(s: string, st: { p: number }, n: number): void {
  st.p++
  skipWs(s, st, n)
  if (st.p < n && s[st.p] === ']') {
    st.p++
    return
  }
  for (;;) {
    skipWs(s, st, n)
    readValue(s, st, n)
    skipWs(s, st, n)
    if (st.p >= n) throw new LintError('Array nicht geschlossen — es fehlt „]“.', st.p)
    if (s[st.p] === ',') {
      st.p++
      skipWs(s, st, n)
      if (st.p < n && s[st.p] === ']') throw new LintError('Ueberzaehliges Komma vor „]“.', st.p)
      continue
    }
    if (s[st.p] === ']') {
      st.p++
      return
    }
    throw new LintError(`Erwartet „,“ oder „]“ — gefunden ${visible(s[st.p])}.`, st.p)
  }
}

function readString(s: string, st: { p: number }, n: number): void {
  const start = st.p
  st.p++
  while (st.p < n) {
    const c = s[st.p] as string
    if (c === '"') {
      st.p++
      return
    }
    if (c === '\\') {
      const esc = s[st.p + 1]
      if (esc === undefined) throw new LintError('Unerwartetes Dateiende in einer Zeichenkette.', st.p)
      if (!'"\\/bfnrtu'.includes(esc)) {
        throw new LintError(`Ungueltige Escape-Sequenz \\${esc}. Erlaubt sind \\" \\\\ \\/ \\b \\f \\n \\r \\t und \\uXXXX.`, st.p)
      }
      st.p += esc === 'u' ? 6 : 2
      continue
    }
    if (c === '\n') {
      throw new LintError('Zeichenkette nicht geschlossen — ein Zeilenumbruch muss als \\n geschrieben werden.', start)
    }
    st.p++
  }
  throw new LintError('Zeichenkette nicht geschlossen — es fehlt das abschliessende ".', start)
}

function readNumber(s: string, st: { p: number }, n: number): void {
  const start = st.p
  if (s[st.p] === '-') st.p++
  while (st.p < n && /[0-9]/.test(s[st.p] as string)) st.p++
  if (st.p < n && s[st.p] === '.') {
    st.p++
    while (st.p < n && /[0-9]/.test(s[st.p] as string)) st.p++
  }
  if (st.p < n && (s[st.p] === 'e' || s[st.p] === 'E')) {
    st.p++
    if (st.p < n && (s[st.p] === '+' || s[st.p] === '-')) st.p++
    while (st.p < n && /[0-9]/.test(s[st.p] as string)) st.p++
  }
  if (st.p === start) throw new LintError('Ungueltige Zahl.', start)
}

function readLiteral(s: string, st: { p: number }, n: number, word: string): void {
  if (s.slice(st.p, st.p + word.length) !== word) {
    throw new LintError('Nur true, false und null sind erlaubt (klein geschrieben, ohne Anfuehrungszeichen).', st.p)
  }
  st.p += word.length
}

/** Klartexthinweis zu einer Fehlermeldung. */
export function jsonHint(message: string): string {
  if (message.includes('Komma')) return 'Ueberzaehliges Komma entfernen bzw. fehlendes Komma zwischen den Eintraegen ergaenzen.'
  if (message.includes('Zeichenkette')) return 'Zeichenkette mit " abschliessen; enthaltene " als \\" und Zeilenumbrueche als \\n schreiben.'
  if (message.includes('Anfuehrungszeichen')) return 'JSON verlangt doppelte Anfuehrungszeichen (") um Schluessel und Text — keine einfachen.'
  if (message.includes('„:“')) return 'Zwischen Schluessel und Wert gehoert ein Doppelpunkt: "schluessel": wert.'
  if (message.includes('Escape')) return 'Gueltige Escapes sind \\" \\\\ \\/ \\b \\f \\n \\r \\t und \\uXXXX.'
  if (message.includes('true, false')) return 'Nur true, false und null sind erlaubt, klein geschrieben und ohne Anfuehrungszeichen.'
  return 'An der markierten Stelle Klammern, Kommas und Anfuehrungszeichen pruefen.'
}
