/*
 * Beschriftung eines Schemawerts — eine Stelle fuer alle Oberflaechen.
 *
 * Reihenfolge: uebersetzter Text aus i18n, sonst die getrennten
 * Binnenmajuskeln. Der technische Wert wird nicht ersetzt, sondern ergaenzt;
 * wer nach "PreferredTitle" sucht, soll ihn weiterhin finden.
 */
export function useVocabLabel() {
  const { t, te } = useI18n()

  function label(enumName: string, value: string): string {
    if (value === '') return ''
    const key = `mapping.vocab.values.${enumName}.${value}`
    if (enumName !== '' && te(key)) return t(key)
    return splitCamel(value)
  }

  /** Beschriftung mit dem technischen Wert dahinter, wenn er abweicht. */
  function labelWithCode(enumName: string, value: string): string {
    const text = label(enumName, value)
    return text === value ? value : `${text} · ${value}`
  }

  return { label, labelWithCode }
}
