/**
 * Haelt den Tastaturfokus fest, waehrend ein Bedienelement voruebergehend
 * gesperrt wird.
 *
 * Ein Knopf mit disabled verliert den Fokus an <body>. Wer mit der Tastatur
 * arbeitet, steht danach wieder am Seitenanfang und muss sich zurueckhangeln;
 * mit einem Vorlesewerkzeug geht ausserdem der Zusammenhang verloren. Die
 * Hilfsfunktion merkt sich das zuletzt fokussierte Element und gibt ihm den
 * Fokus zurueck, sobald es wieder bedienbar ist.
 */
export function useKeepFocus() {
  return async function keepFocus<T>(run: () => Promise<T>): Promise<T> {
    const before = import.meta.client ? (document.activeElement as HTMLElement | null) : null
    try {
      return await run()
    } finally {
      if (before !== null) {
        await nextTick()
        if (before.isConnected && document.activeElement === document.body) before.focus()
      }
    }
  }
}
