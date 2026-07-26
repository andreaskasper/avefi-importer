/* AVefi Importer — UI-Helfer: Buttons während längerer Prozeduren auf Spinner stellen.
 * window.AvefiUI.spin(btn[, text]) / .unspin(btn)
 * Automatisch: der auslösende Submit-Button eines Formulars wird beim Absenden zum Spinner.
 * Opt-out pro Formular mit  <form data-no-spin="1">.
 */
(function () {
  "use strict";

  function spin(btn, text) {
    if (!btn || btn.getAttribute("data-loading") === "1") return;
    btn.setAttribute("data-loading", "1");
    btn.setAttribute("data-orig", btn.innerHTML);
    var label = (text !== undefined) ? text : (btn.getAttribute("data-loading-text") || btn.textContent.trim());
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>' + (label ? " " + label : "");
    // Deaktivieren erst nach dem aktuellen Event-Tick, damit ein laufender Submit nicht abbricht.
    setTimeout(function () { try { btn.disabled = true; } catch (e) {} }, 0);
  }

  function unspin(btn) {
    if (!btn || btn.getAttribute("data-loading") !== "1") return;
    try { btn.disabled = false; } catch (e) {}
    var orig = btn.getAttribute("data-orig");
    if (orig !== null) btn.innerHTML = orig;
    btn.removeAttribute("data-loading");
    btn.removeAttribute("data-orig");
  }

  window.AvefiUI = { spin: spin, unspin: unspin };

  // Formular-Submit → auslösenden Button spinnen (sofern nicht verhindert, z. B. data-confirm/Validierung).
  document.addEventListener("submit", function (e) {
    if (e.defaultPrevented) return;
    var form = e.target;
    if (!form || form.getAttribute("data-no-spin") === "1") return;
    var btn = e.submitter ||
      form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (btn) spin(btn);
  });
})();
