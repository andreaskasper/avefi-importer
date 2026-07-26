/* AVefi Importer — leichtes Modal (bootbox-artig, im App-Design). Vanilla JS. */
(function () {
  "use strict";

  function alertBox(opts) {
    opts = (typeof opts === "string") ? { message: opts } : (opts || {});

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    var box = document.createElement("div");
    box.className = "modal-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML =
      '<div class="modal-head"><h3></h3><button type="button" class="modal-x" aria-label="Schließen">×</button></div>' +
      '<div class="modal-body"></div>' +
      '<div class="modal-foot"><button type="button" class="btn btn-primary modal-ok"></button></div>';

    box.querySelector(".modal-head h3").textContent = opts.title || "Hinweis";
    box.querySelector(".modal-body").textContent = opts.message || "";
    box.querySelector(".modal-ok").textContent = opts.okText || "OK";

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", onKey);
      if (typeof opts.callback === "function") opts.callback();
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    box.querySelector(".modal-ok").addEventListener("click", close);
    box.querySelector(".modal-x").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    setTimeout(function () { box.querySelector(".modal-ok").focus(); }, 0);

    return { close: close };
  }

  window.AvefiModal = { alert: alertBox };
})();
