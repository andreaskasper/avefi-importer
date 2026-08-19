# Vue-Oberflächen prüfen

Die interaktiven Teile (`skins/editor-avefi.js`, `skins/mapping-editor.js`) laufen im
Browser und werden von den Codeception-Tests nicht erfasst. Zwei Prüfungen fangen die
beiden Fehlerklassen ab, die sonst erst der Nutzer bemerkt.

## 1 · Übersetzt das Template?

Der mitgelieferte Vue-Global-Build enthält den Compiler. `Vue.compile()` meldet
Syntaxfehler im Template, ohne dass ein Browser nötig ist.

Nötig ist ein DOM-Ersatz für `decodeEntities`: Vue dekodiert HTML-Entities über ein
echtes Element (`el.innerHTML = '<div foo="…">'` und dann
`el.children[0].getAttribute('foo')`). Fehlt dieser Pfad, scheitert der Compiler an
**jedem** Attribut mit `&&` — das sieht nach einem Template-Fehler aus, ist aber keiner.

## 2 · Mountet die Anwendung? (die wichtigere Prüfung)

Ein Template kann fehlerfrei übersetzen und trotzdem eine leere Seite ergeben. Genau
das ist beim Mapping-Editor passiert: Das Wurzel-`<template>` lag **innerhalb** des
Mount-Elements, Vue nutzte die In-DOM-Übersetzung und verlor dabei den Inhalt.

```js
// So funktioniert es (wie in editor-avefi.js):
//   <template id="mappingTpl"> liegt AUSSERHALB von #mappingApp
Vue.createApp({ template: document.getElementById("mappingTpl").innerHTML, ... })
   .mount("#mappingApp");
```

Prüfen lässt sich das mit jsdom, ohne Browser:

```bash
mkdir -p /tmp/uicheck && cd /tmp/uicheck
cp src/html/skins/{vue.global.prod.js,mapping-editor.js,modal.js,ui.js} .
curl -s -b "avefi=<session>" https://<host>/imports/<uuid>/mapping -o page.html
docker run --rm -v "$PWD":/w -w /w node:slim \
  sh -c "npm i jsdom --silent && node run.js"
```

`run.js` lädt die Seite, führt die Skripte aus und prüft anschließend, dass
`#mappingApp` gefüllt ist und die Konsole keine Fehler oder Warnungen enthält. Die
Anwendung lässt sich dabei auch bedienen — Knöpfe per `dispatchEvent` auslösen und das
Ergebnis im DOM nachsehen (Zeile aufklappen, Zweig hinzufügen, Konverter-Auswahl
öffnen). `window.fetch` wird auf ein nie erfülltes Promise gesetzt, damit die Vorschau
den Test nicht braucht.

Faustregel: **„Template übersetzt" ist keine Zusage, dass etwas erscheint.** Erst der
gefüllte Mount-Container ist eine.
