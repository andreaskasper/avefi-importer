/*
 * Uebersetzung der Gruppennamen aus Ziel- und Konverterkatalog.
 *
 * Der Server liefert den Gruppennamen als deutschen Klartext ("Titel",
 * "Beteiligte", "Text"). Dieser Name ist der stabile Schluessel und bleibt
 * serverseitig unveraendert; uebersetzt wird erst bei der Anzeige ueber
 * mapping.group.*. Fehlt der Schluessel — etwa bei einer neuen Gruppe, die noch
 * niemand uebersetzt hat —, steht der deutsche Name da statt einer leeren
 * Zelle oder eines rohen Schluessels.
 */
export function useGroupLabel(): (group: string) => string {
  const { t, te } = useI18n()
  return (group: string): string => {
    const key = `mapping.group.${group}`
    return te(key) ? t(key) : group
  }
}
