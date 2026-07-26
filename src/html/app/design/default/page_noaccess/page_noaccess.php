<?php
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$page_title = "Kein Zugriff · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap">
  <div class="empty" style="margin-top:40px">
    <div class="ic">🔒</div>
    <div class="fn" style="font-size:16px;margin-bottom:4px">Kein Zugriff</div>
    <div class="small">Dieser Bereich ist Administrator:innen vorbehalten.</div>
    <p style="margin-top:16px"><a class="btn btn-primary btn-sm" href="/">Zur Startseite</a></p>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
