<?php
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$page_title = "Nicht gefunden · AVefi Importer";
include __DIR__ . "/../layout/head.php";
?>
<div class="auth">
  <div style="text-align:center">
    <div class="logo" style="justify-content:center;font-weight:700;font-size:18px;display:flex;align-items:center;gap:9px;margin-bottom:14px"><span class="dot"></span> AVefi&nbsp;Importer</div>
    <h1 style="font-size:64px;letter-spacing:-.03em">404</h1>
    <p class="dim">Diese Seite existiert nicht.</p>
    <p style="margin-top:16px"><a class="btn btn-primary" href="/">Zur Startseite</a></p>
  </div>
</div>
<?php include __DIR__ . "/../layout/foot.php"; ?>
