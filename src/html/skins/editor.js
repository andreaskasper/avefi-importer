/* AVefi Importer — Record-Editor: wiederholbare Zeilen + JSON-Vorschau. */
(function () {
  "use strict";

  // hohe Start-Indizes, damit sie nicht mit vorhandenen (0..n) kollidieren
  var counters = { contributor: 1000000, manifestation: 1000000, item: 1000000 };
  var MAP = {
    contributor:   { tpl: "tpl-contributor",   list: "contribList" },
    manifestation: { tpl: "tpl-manifestation", list: "manifList" },
    item:          { tpl: "tpl-item",          list: "itemList" }
  };

  document.addEventListener("click", function (e) {
    var add = e.target.closest ? e.target.closest("[data-add]") : null;
    if (add) {
      var kind = add.getAttribute("data-add");
      var cfg = MAP[kind];
      if (!cfg) return;
      var tpl = document.getElementById(cfg.tpl);
      var list = document.getElementById(cfg.list);
      if (!tpl || !list) return;
      var html = tpl.innerHTML.replace(/__i__/g, String(counters[kind]++)).trim();
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var node = wrap.firstElementChild;
      if (!node) return;
      list.appendChild(node);
      var f = node.querySelector("input, textarea");
      if (f) f.focus();
      return;
    }
    var rem = e.target.closest ? e.target.closest("[data-remove]") : null;
    if (rem) {
      var row = rem.closest(".repeat-row");
      if (row) row.parentNode.removeChild(row);
    }
  });

  var jt = document.getElementById("jsonToggle");
  var jp = document.getElementById("jsonPreview");
  if (jt && jp) jt.addEventListener("click", function () { jp.hidden = !jp.hidden; });

  // PID-Registrierung ist noch nicht freigeschaltet — Hinweis-Modal zeigen.
  var pidBtn = document.getElementById("pidRegisterBtn");
  if (pidBtn) {
    pidBtn.addEventListener("click", function () {
      if (window.AvefiModal) {
        AvefiModal.alert({
          title: "PID-Registrierung",
          message: "Diese Funktion ist noch nicht freigeschaltet. Die Vergabe von AVefi-PIDs erfolgt zu einem späteren Zeitpunkt durch AVefi."
        });
      } else {
        alert("Diese Funktion ist noch nicht freigeschaltet.");
      }
    });
  }
})();
