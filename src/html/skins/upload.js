/* AVefi Importer — Datei-Upload (Dropzone, Fortschritt, Löschen). Vanilla JS. */
(function () {
  "use strict";

  var dz = document.getElementById("dropzone");
  if (!dz) return;

  var fileInput  = document.getElementById("fileInput");
  var pickBtn    = document.getElementById("pickBtn");
  var uploadList = document.getElementById("uploadList");

  var URL_UPLOAD = dz.getAttribute("data-upload-url") || "/upload";
  var CSRF       = dz.getAttribute("data-csrf") || "";
  var MAXBYTES   = parseInt(dz.getAttribute("data-maxbytes") || "209715200", 10);
  var ALLOWED    = ["csv", "tsv", "xml", "ead", "marcxml", "marc", "json"];

  /* ---- Dateiauswahl ---- */
  pickBtn && pickBtn.addEventListener("click", function () { fileInput.click(); });
  dz.addEventListener("click", function (e) {
    if (e.target === pickBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });

  /* ---- Drag & Drop ---- */
  ["dragenter", "dragover"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add("dragover"); });
  });
  ["dragleave", "dragend", "drop"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove("dragover"); });
  });
  dz.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  /* ---- Upload-Steuerung ---- */
  var pending = 0, succeeded = 0;

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    uploadList.hidden = false;
    files.forEach(startUpload);
  }

  function ext(name) {
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  function startUpload(file) {
    var item = addItem(file.name);
    pending++;

    if (ALLOWED.indexOf(ext(file.name)) === -1) {
      return finish(item, false, "Format wird nicht unterstützt");
    }
    if (file.size > MAXBYTES) {
      return finish(item, false, "Datei zu groß (max. 200 MB)");
    }

    var form = new FormData();
    form.append("_csrf", CSRF);
    form.append("file", file, file.name);

    var xhr = new XMLHttpRequest();
    xhr.open("POST", URL_UPLOAD, true);
    xhr.upload.addEventListener("progress", function (e) {
      if (e.lengthComputable) setProgress(item, Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", function () {
      var res = null;
      try { res = JSON.parse(xhr.responseText); } catch (err) { res = null; }
      if (xhr.status >= 200 && xhr.status < 300 && res && res.ok) {
        setProgress(item, 100);
        finish(item, true, "Hochgeladen");
      } else {
        finish(item, false, (res && res.error) ? res.error : "Fehler (" + xhr.status + ")");
      }
    });
    xhr.addEventListener("error", function () { finish(item, false, "Netzwerkfehler"); });
    xhr.send(form);
  }

  function finish(item, ok, msg) {
    setStatus(item, ok, msg);
    if (!ok) setProgressBarClass(item, "danger");
    pending--;
    if (ok) succeeded++;
    if (pending === 0 && succeeded > 0) {
      setTimeout(function () { window.location.reload(); }, 700);
    }
  }

  /* ---- UI-Bausteine ---- */
  function addItem(name) {
    var el = document.createElement("div");
    el.className = "upload-item";
    el.innerHTML =
      '<div class="ui-head"><span class="fn"></span><span class="ui-status dim small">0 %</span></div>' +
      '<div class="prog acc" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Upload-Fortschritt"><i style="width:0%"></i></div>';
    el.querySelector(".fn").textContent = name;
    uploadList.appendChild(el);
    return el;
  }
  function setProgress(item, pct) {
    var bar = item.querySelector(".prog");
    bar.querySelector("i").style.width = pct + "%";
    bar.setAttribute("aria-valuenow", pct);
    var s = item.querySelector(".ui-status");
    if (s && !item.dataset.done) s.textContent = pct + " %";
  }
  function setProgressBarClass(item, cls) {
    var p = item.querySelector(".prog");
    p.className = "prog " + cls;
    p.querySelector("i").style.width = "100%";
  }
  function setStatus(item, ok, msg) {
    item.dataset.done = "1";
    var s = item.querySelector(".ui-status");
    s.textContent = (ok ? "✓ " : "✕ ") + msg;
    s.className = "ui-status small " + (ok ? "ui-ok" : "ui-err");
    if (ok) item.querySelector(".prog").className = "prog ok";
  }

})();
