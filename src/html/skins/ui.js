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

  /* ------------------------------------------------------------------
   * Kontextmenü ("…"-Menü) — wiederverwendbar und tastaturbedienbar.
   *
   *   <div class="rowmenu">
   *     <button type="button" class="iconbtn-menu" data-menu-btn
   *             aria-haspopup="true" aria-expanded="false"
   *             aria-label="Weitere Aktionen">…</button>
   *     <div class="menu menu-float" data-menu role="menu" hidden> … </div>
   *   </div>
   *
   * Das Menü wird beim Öffnen an <body> gehängt und fest positioniert. Grund:
   * Tabellen stecken in .tablewrap mit overflow:auto — ein normal positioniertes
   * Menü in der letzten Zeile würde an der Containerkante abgeschnitten.
   * Beim Schließen wandert es an seinen ursprünglichen Platz zurück, damit das
   * Markup der Seite unverändert bleibt.
   * ------------------------------------------------------------------ */

  var openMenu = null;   // aktuell offenes Menü-Element
  var openBtn  = null;

  function menuItems(menu) {
    return Array.prototype.filter.call(
      menu.querySelectorAll('[role="menuitem"]'),
      function (el) { return !el.hasAttribute("disabled"); }
    );
  }

  function placeMenu(menu, btn) {
    var r = btn.getBoundingClientRect();
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var gap = 6, pad = 8;

    var left = r.right - w;                                  // rechtsbündig zum Auslöser
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - w);

    var top = r.bottom + gap;                                // bevorzugt darunter
    if (top + h > window.innerHeight - pad) {
      var above = r.top - gap - h;
      top = above >= pad ? above : Math.max(pad, window.innerHeight - pad - h);
    }
    menu.style.left = Math.round(left) + "px";
    menu.style.top  = Math.round(top) + "px";
  }

  function closeMenu(refocus) {
    if (!openMenu) return;
    var menu = openMenu, btn = openBtn;
    openMenu = null; openBtn = null;

    menu.hidden = true;
    menu.style.left = ""; menu.style.top = "";
    if (menu.__home && menu.__home.parentNode) menu.__home.appendChild(menu);
    menu.__home = null;

    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      if (refocus) { try { btn.focus(); } catch (e) {} }
    }
  }

  function showMenu(btn) {
    var menu = btn.parentNode ? btn.parentNode.querySelector("[data-menu]") : null;
    if (!menu) return;
    closeMenu(false);

    menu.__home = btn.parentNode;
    document.body.appendChild(menu);
    menu.hidden = false;
    openMenu = menu; openBtn = btn;
    btn.setAttribute("aria-expanded", "true");

    placeMenu(menu, btn);
    var items = menuItems(menu);
    if (items.length) { try { items[0].focus(); } catch (e) {} }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-menu-btn]") : null;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (openBtn === btn) closeMenu(true); else showMenu(btn);
      return;
    }
    if (openMenu && !openMenu.contains(e.target)) closeMenu(false);
  });

  /* Ein angeklickter Menüpunkt schließt das Menü — aber erst, nachdem der Klick
   * durchgelaufen ist, damit nachgelagerte Handler ihn noch sehen. */
  document.addEventListener("click", function (e) {
    if (!openMenu || !openMenu.contains(e.target)) return;
    if (!e.target.closest('[role="menuitem"]')) return;
    setTimeout(function () { closeMenu(false); }, 0);
  });

  document.addEventListener("keydown", function (e) {
    if (!openMenu) return;
    var items = menuItems(openMenu);
    var i = items.indexOf(document.activeElement);

    if (e.key === "Escape")       { e.preventDefault(); closeMenu(true); return; }
    if (e.key === "Tab")          { closeMenu(false); return; }
    if (e.key === "ArrowDown")    { e.preventDefault(); if (items.length) items[(i + 1 + items.length) % items.length].focus(); return; }
    if (e.key === "ArrowUp")      { e.preventDefault(); if (items.length) items[(i - 1 + items.length) % items.length].focus(); return; }
    if (e.key === "Home")         { e.preventDefault(); if (items.length) items[0].focus(); return; }
    if (e.key === "End")          { e.preventDefault(); if (items.length) items[items.length - 1].focus(); return; }
  });

  /* Beim Scrollen oder Größenändern wäre die feste Position falsch — schließen. */
  window.addEventListener("scroll", function () { closeMenu(false); }, true);
  window.addEventListener("resize", function () { closeMenu(false); });

  window.AvefiUI = { spin: spin, unspin: unspin, closeMenu: closeMenu };


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
