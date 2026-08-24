/* AVefi Importer — Aktionen aus dem Zeilenmenü der Importliste (Löschen,
 * Neukonvertieren). Vanilla JS.
 *
 * Die Aktionen hängen bewusst nicht am DOM-Baum, sondern tragen die Import-ID
 * selbst (data-id): Das Menü wird zum Anzeigen an <body> verschoben, deshalb ist
 * closest("tr") im Moment des Klicks nicht verlässlich.
 */
(function () {
  "use strict";

  var host = document.querySelector("[data-import-actions]");
  if (!host) return;
  var CSRF = host.getAttribute("data-csrf") || "";

  function notify(msg) { if (window.AvefiModal) AvefiModal.alert(msg); else alert(msg); }

  function rowOf(id) {
    return document.querySelector('tr[data-import-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  }

  function post(url, id, onOk, onFail) {
    var form = new FormData();
    form.append("_csrf", CSRF);
    form.append("id", id);
    fetch(url, { method: "POST", body: form, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (res && res.ok) onOk(res);
        else onFail((res && res.error) ? res.error : "Die Aktion ist fehlgeschlagen.");
      })
      .catch(function () { onFail("Die Aktion ist fehlgeschlagen — keine Verbindung zum Server."); });
  }

  /* ---- Löschen ---- */
  function doDelete(id) {
    var row = rowOf(id);
    if (row) row.style.opacity = ".5";
    post("/import/delete", id,
      function () { if (row && row.parentNode) row.parentNode.removeChild(row); },
      function (msg) { if (row) row.style.opacity = ""; notify(msg); });
  }

  /* ---- Neu konvertieren ---- */
  function doReconvert(id) {
    var row = rowOf(id);
    if (row) row.style.opacity = ".5";
    post("/imports/" + encodeURIComponent(id) + "/reconvert", id,
      function () { window.location.reload(); },
      function (msg) { if (row) row.style.opacity = ""; notify(msg); });
  }


  /* ---- Selbstaktualisierung, solange etwas in Arbeit ist ----
   * Vorher blieb „In Konvertierung" stehen, bis jemand die Seite neu lud — man
   * wusste nicht, ob der Worker noch arbeitet oder längst fertig ist.
   */
  (function () {
    var timer = null, misses = 0;

    function apply(data) {
      var changed = false;
      Object.keys(data.imports || {}).forEach(function (id) {
        var row = rowOf(id);
        if (!row) return;
        var info = data.imports[id];
        var badge = row.querySelector(".badge");
        if (badge && badge.textContent.trim() !== info.label) {
          badge.className = "badge " + info.badge;
          badge.innerHTML = '<span class="bd"></span>' + info.label;
          changed = true;
        }
        var recs = row.querySelector("td.tnum");
        if (recs && info.records > 0 && recs.textContent.trim() !== String(info.records)) {
          recs.textContent = info.records;
        }
      });
      // Ein abgeschlossener Lauf ändert auch die Knöpfe in der Zeile — dafür reicht
      // die Teilaktualisierung nicht, also einmal sauber neu laden.
      if (changed && !data.busy) window.location.reload();
    }

    function poll() {
      fetch("/imports/status", { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) return stop();
          apply(res);
          if (!res.busy && ++misses > 2) stop();
        })
        .catch(stop);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    if (document.querySelector("tr[data-import-id]")) {
      timer = setInterval(poll, 5000);
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
    }
  })();

  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id     = el.getAttribute("data-id");
    if (!id) return;

    if (action === "delete") {
      e.preventDefault();
      AvefiModal.confirm({
        title: "Import löschen",
        message: "Diesen Import inklusive der hochgeladenen Datei und aller daraus erzeugten Datensätze löschen? Das lässt sich nicht rückgängig machen.",
        okText: "Löschen",
        danger: true,
        onConfirm: function () { doDelete(id); }
      });
      return;
    }

    if (action === "reconvert") {
      e.preventDefault();
      var edited = parseInt(el.getAttribute("data-edited") || "0", 10);
      var msg = "Der Import wird mit dem hinterlegten Converter erneut aus der Originaldatei erzeugt.";
      if (edited > 0) {
        msg = "Dieser Import enthält " + edited + " von Hand bearbeitete " +
              (edited === 1 ? "Datensatz" : "Datensätze") + ". Beim Neukonvertieren " +
              (edited === 1 ? "wird er" : "werden sie") + " durch die Werte aus der Originaldatei ersetzt. " +
              "Diese Änderungen gehen verloren.";
      }
      AvefiModal.confirm({
        title: "Neu konvertieren",
        message: msg,
        okText: edited > 0 ? "Trotzdem neu konvertieren" : "Neu konvertieren",
        danger: edited > 0,
        onConfirm: function () { doReconvert(id); }
      });
      return;
    }
  });
})();
