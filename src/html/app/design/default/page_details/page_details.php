<?php
/*
 * Fehler-Detailseite eines Imports. Erwartet: $import (Import), $detail (?array
 * aus ParseDiagnostics), $failed (?array letzter fehlgeschlagener worker_job).
 * Erklärt den Verarbeitungsfehler mit Position, Code-Ausschnitt und Lösungshinweis.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$stages = [
	"download"     => "Herunterladen der Datei",
	"detect"       => "Format-Erkennung",
	"convert"      => "Konvertierung",
	"register_pid" => "PID-Registrierung",
];
$stageLabel = $failed && isset($stages[$failed["classname"]]) ? $stages[$failed["classname"]] : null;
$errors     = is_array($detail) ? ($detail["errors"] ?? []) : [];

[$badgeClass, $badgeLabel] = $import->statusBadge();
$page_title = html($import->filename()) . " · Fehlerdetails";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs">
    <a href="/">Importe</a><span class="sep">/</span><span><?php echo html($import->filename()); ?></span>
    <span class="sep">/</span><span>Fehlerdetails</span>
  </div>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px">Fehlerdetails</h2>
    <span class="fmt"><?php echo html($import->detectedFormat() ?: strtoupper((string)$import->baseFormat())); ?></span>
    <span class="badge <?php echo $badgeClass; ?>"><span class="bd"></span><?php echo html($badgeLabel); ?></span>
    <span class="dim small"><?php echo html($import->filename()); ?></span>
    <div style="margin-left:auto">
      <a class="btn btn-outline btn-sm" href="/">Zur Übersicht</a>
    </div>
  </div>

  <div class="alert" role="alert" style="margin-bottom:16px">
    Die Verarbeitung ist fehlgeschlagen<?php echo $stageLabel ? " bei: <b>" . html($stageLabel) . "</b>" : ""; ?>.
    <?php if ($failed && trim((string)($failed["error"] ?? "")) !== ""): ?>
      <div class="small" style="margin-top:6px;opacity:.9">Meldung des Workers: <span class="mono"><?php echo html($failed["error"]); ?></span></div>
    <?php endif; ?>
  </div>

  <?php if (empty($errors)): ?>
    <div class="tablewrap"><div class="empty">
      <div class="ic" aria-hidden="true">🔍</div>
      <div class="fn" style="font-size:15px;margin-bottom:4px">Keine zeilengenauen Details verfügbar</div>
      <div class="small">Zur Datei liegt keine weitere Diagnose vor. Prüfen Sie die Worker-Meldung oben.</div>
    </div></div>
  <?php else: ?>
    <?php foreach ($errors as $e):
      $sev  = ($e["severity"] ?? "error") === "warn" ? "warn" : "error";
      $line = $e["line"] ?? null; $col = $e["column"] ?? null;
      $snip = $e["snippet"] ?? null;
    ?>
      <div class="card" style="margin-bottom:14px;border-left:4px solid var(--<?php echo $sev === "warn" ? "warn" : "danger"; ?>)">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <span class="badge <?php echo $sev === "warn" ? "b-warn" : "b-danger"; ?>"><?php echo $sev === "warn" ? "Hinweis" : "Fehler"; ?></span>
          <b style="font-size:15px"><?php echo html($e["message"]); ?></b>
          <?php if ($line !== null): ?>
            <span class="dim small mono">Zeile <?php echo (int)$line; ?><?php echo $col !== null ? ", Spalte " . (int)$col : ""; ?></span>
          <?php endif; ?>
        </div>

        <?php if (is_array($snip) && !empty($snip["lines"])): ?>
          <pre class="jsonprev" style="margin:10px 0 0;overflow-x:auto" aria-label="Code-Ausschnitt der Fehlerstelle"><?php
            foreach ($snip["lines"] as $ln) {
              $isErr = ((int)$ln["no"] === (int)($snip["error_line"] ?? -1));
              $text  = str_replace("\t", " ", (string)$ln["text"]);
              $gutter = sprintf("%4d │ ", (int)$ln["no"]);
              if ($isErr) {
                echo '<span style="background:var(--danger-bg);color:var(--danger);display:inline-block;width:100%">'
                   . html($gutter . $text) . "</span>\n";
                if ($col !== null) {
                  echo '<span aria-hidden="true">' . html(str_repeat(" ", 4) . " │ " . str_repeat(" ", max(0, (int)$col - 1))) . "^</span>\n";
                }
              } else {
                echo html($gutter . $text) . "\n";
              }
            }
          ?></pre>
        <?php endif; ?>

        <?php if (trim((string)($e["hint"] ?? "")) !== ""): ?>
          <div class="val-list" style="margin-top:10px">
            <div class="vi"><span class="m badge b-ok" style="padding:1px 6px">→</span><span><b>Lösung:</b> <?php echo html($e["hint"]); ?></span></div>
          </div>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>

    <p class="note">
      Korrigieren Sie die Datei an den markierten Stellen und laden Sie sie erneut hoch.
      Bei gültigem, aber unbekanntem Format hilft ggf. die <a href="/imports/<?php echo htmlattr($import->id()); ?>/report">Prüfbericht-Seite</a>.
    </p>
  <?php endif; ?>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
