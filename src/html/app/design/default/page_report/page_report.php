<?php
/*
 * Fehler-/Validierungsreport eines Imports. Erwartet: $import (Import).
 * Zeigt Parse-Hinweise und Schema-Beanstandungen aus imports.report_json.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$report  = $import->report();
$summary = $report["summary"] ?? [];
$parse   = $report["parse_errors"] ?? [];
$invalid = $report["invalid_records"] ?? [];

[$badgeClass, $badgeLabel] = $import->statusBadge();
$page_title = html($import->filename()) . " · Report";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap">
  <div class="crumbs">
    <a href="/">Importe</a><span class="sep">/</span><span><?php echo html($import->filename()); ?></span>
    <span class="sep">/</span><span>Report</span>
  </div>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px">Prüfbericht</h2>
    <?php if ($import->baseFormat()): ?><span class="fmt"><?php echo html(strtoupper($import->baseFormat())); ?></span><?php endif; ?>
    <span class="badge <?php echo $badgeClass; ?>"><span class="bd"></span><?php echo html($badgeLabel); ?></span>
    <span class="dim small"><?php echo html($import->filename()); ?></span>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <a class="btn btn-outline btn-sm" href="/imports/<?php echo htmlattr($import->id()); ?>/records">Datensätze</a>
      <a class="btn btn-outline btn-sm" href="/imports/<?php echo htmlattr($import->id()); ?>/avefi.json">⬇ AVefi-JSON</a>
    </div>
  </div>

  <?php if ($report === null): ?>
    <div class="tablewrap"><div class="empty">
      <div class="ic">🧪</div>
      <div class="fn" style="font-size:15px;margin-bottom:4px">Noch kein Bericht</div>
      <div class="small">Dieser Import wurde noch nicht verarbeitet. Der Bericht entsteht bei der Konvertierung.</div>
    </div></div>
  <?php else: ?>

    <?php
      $recs    = (int)($summary["records"] ?? 0);
      $av      = (int)($summary["avefi_records"] ?? 0);
      $vok     = (int)($summary["valid"] ?? 0);
      $vbad    = (int)($summary["invalid"] ?? 0);
      $rowErr  = (int)($summary["row_errors"] ?? 0);
      $allGood = empty($parse) && $vbad === 0 && $rowErr === 0;
    ?>

    <?php if ($allGood): ?>
      <div class="alert alert-ok" style="margin-bottom:16px">
        ✓ Alles in Ordnung — <?php echo $av; ?> AVefi-Record<?php echo $av === 1 ? "" : "s"; ?> entsprechen dem av-efi-schema.
      </div>
    <?php else: ?>
      <div class="alert" style="margin-bottom:16px">
        Es gibt Beanstandungen. <?php echo $vbad; ?> von <?php echo $av; ?> AVefi-Record<?php echo $av === 1 ? "" : "s"; ?> entsprechen noch nicht dem Schema<?php echo $parse ? ", außerdem " . count($parse) . " Parse-Hinweis(e)" : ""; ?>.
      </div>
    <?php endif; ?>

    <div class="grid2" style="grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
      <div class="card kpi"><span class="v tnum"><?php echo $recs; ?></span><span class="l">Datensätze (Werke)</span></div>
      <div class="card kpi"><span class="v tnum"><?php echo $av; ?></span><span class="l">AVefi-Records geprüft</span></div>
      <div class="card kpi"><span class="v tnum" style="color:var(--ok,#16a34a)"><?php echo $vok; ?></span><span class="l">schema-gültig</span></div>
      <div class="card kpi"><span class="v tnum" style="color:<?php echo $vbad ? "var(--danger,#dc2626)" : "inherit"; ?>"><?php echo $vbad; ?></span><span class="l">mit Beanstandung</span></div>
    </div>

    <?php if ($parse): ?>
      <h3 class="side-h" style="margin:0 0 8px">Parse-Hinweise<?php echo $rowErr ? " · " . $rowErr . " Zeile(n) nicht übernommen" : ""; ?></h3>
      <div class="tablewrap" style="margin-bottom:18px"><div style="padding:8px 12px" class="val-list">
        <?php foreach ($parse as $p): ?>
          <div class="vi"><span class="m badge b-warn" style="padding:1px 6px">!</span><span><?php echo html($p); ?></span></div>
        <?php endforeach; ?>
      </div></div>
    <?php endif; ?>

    <?php if ($invalid): ?>
      <h3 class="side-h" style="margin:0 0 8px">Schema-Beanstandungen</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th style="width:34%">Record</th><th style="width:16%">Typ</th><th>Beanstandung(en)</th></tr></thead>
          <tbody>
          <?php foreach ($invalid as $iv):
            $cls   = $iv["class"] ?? null;
            $cat   = $iv["category"] ?? null;
            $typ   = $cls ?? ($cat ?? "?");
            $title = trim((string)($iv["title"] ?? "")) !== "" ? $iv["title"] : "(ohne Titel)";
          ?>
            <tr>
              <td>
                <div class="fn"><?php echo html($title); ?></div>
                <div class="dim small">AVefi-Record #<?php echo (int)($iv["index"] ?? 0) + 1; ?></div>
              </td>
              <td><span class="badge <?php echo $cls ? "b-neutral" : "b-danger"; ?>"><?php echo html($typ); ?></span></td>
              <td>
                <div class="val-list">
                  <?php foreach (($iv["errors"] ?? []) as $e): ?>
                    <div class="vi"><span class="m badge b-danger" style="padding:1px 6px">×</span><span><?php echo html($e); ?></span></div>
                  <?php endforeach; ?>
                </div>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
      <p class="note">Geprüft gegen das av-efi-schema (WorkVariant / Manifestation / Item). Titel/Beteiligte lassen sich im <a href="/imports/<?php echo htmlattr($import->id()); ?>/records">Datensatz-Editor</a> korrigieren.</p>
    <?php elseif (!$parse): ?>
      <p class="note">Keine Schema-Beanstandungen gefunden.</p>
    <?php endif; ?>

  <?php endif; ?>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
