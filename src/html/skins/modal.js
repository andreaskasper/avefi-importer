/* AVefi Importer — leichte Modals (bootbox-artig, im App-Design). Vanilla JS.
 * API:  AvefiModal.alert({title,message,okText,callback})
 *       AvefiModal.confirm({title,message,okText,cancelText,danger,onConfirm,onCancel})
 * Deklarativ: <form data-confirm="Frage" [data-confirm-title] [data-confirm-ok] [data-confirm-danger]>
 */
(function () {
  "use strict";

  function build(opts, buttons) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    var box = document.createElement("div");
    box.className = "modal-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML =
      '<div class="modal-head"><h3></h3><button type="button" class="modal-x" aria-label="Schließen">×</button></div>' +
      '<div class="modal-body"></div>' +
      '<div class="modal-foot"></div>';
    box.querySelector(".modal-head h3").textContent = opts.title || "Hinweis";
    box.querySelector(".modal-body").textContent = opts.message || "";
    var foot = box.querySelector(".modal-foot");

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", onKey);
    }
    function cancel() { close(); if (opts.onCancel) opts.onCancel(); }
    function onKey(e) { if (e.key === "Escape") cancel(); }

    buttons.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn " + (b.cls || "btn-outline");
      btn.textContent = b.text;
      btn.addEventListener("click", function () { close(); if (b.action) b.action(); });
      foot.appendChild(btn);
      if (b.primary) setTimeout(function () { btn.focus(); }, 0);
    });

    box.querySelector(".modal-x").addEventListener("click", cancel);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) cancel(); });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return { close: close };
  }

  function alertBox(opts) {
    opts = (typeof opts === "string") ? { message: opts } : (opts || {});
    return build(opts, [
      { text: opts.okText || "OK", cls: "btn-primary", primary: true, action: opts.callback }
    ]);
  }

  function confirmBox(opts) {
    opts = opts || {};
    return build(opts, [
      { text: opts.cancelText || "Abbrechen", cls: "btn-outline", action: opts.onCancel },
      { text: opts.okText || "OK", cls: opts.danger ? "btn-danger" : "btn-primary", primary: true, action: opts.onConfirm }
    ]);
  }

  window.AvefiModal = { alert: alertBox, confirm: confirmBox };

  // Deklarativ: <form data-confirm="…"> zeigt vor dem Absenden ein Bestätigungs-Modal.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches("form[data-confirm]")) return;
    if (form.getAttribute("data-confirmed") === "1") return;   // bereits bestätigt → absenden
    e.preventDefault();
    confirmBox({
      title:   form.getAttribute("data-confirm-title") || "Bestätigen",
      message: form.getAttribute("data-confirm"),
      okText:  form.getAttribute("data-confirm-ok") || "OK",
      danger:  form.hasAttribute("data-confirm-danger"),
      onConfirm: function () {
        form.setAttribute("data-confirmed", "1");
        if (window.AvefiUI) {
          var sb = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
          if (sb) AvefiUI.spin(sb);
        }
        form.submit();
      }
    });
  }, true);
})();
