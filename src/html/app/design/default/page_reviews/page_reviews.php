<?php
/*
 * Format-Review-Liste (Admin). Erwartet: $reviews, $resolved, $rejected.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$reviews  = $reviews ?? [];
$resolved = $resolved ?? false;
$rejected = $rejected ?? false;

$page_title = "Format-Review · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
    <h2 style="font-size:19px">Format-Review</h2>
    <span class="dim small"><?php echo count($reviews); ?> offen</span>
  </div>

  <?php if ($resolved): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px">Converter zugeordnet — der Import wird konvertiert.</div><?php endif; ?>
  <?php if ($rejected): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px">Import abgelehnt.</div><?php endif; ?>

  <?php if (empty($reviews)): ?>
    <div class="tablewrap"><div class="empty">
      <div class="ic">✅</div>
      <div class="fn" style="font-size:15px;margin-bottom:4px">Keine offenen Reviews</div>
      <div class="small">Alle hochgeladenen Formate konnten erkannt werden.</div>
    </div></div>
  <?php else: ?>
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Datei</th><th>Format</th><th>Institution</th><th>Fingerprint</th><th>Hochgeladen</th><th style="text-align:right">Aktion</th>
        </tr></thead>
        <tbody>
        <?php foreach ($reviews as $r):
          $when = $r["uploaded_at"] ? date("d.m.Y · H:i", strtotime((string)$r["uploaded_at"])) : "";
        ?>
          <tr>
            <td class="fn"><?php echo html($r["filename"]); ?></td>
            <td><?php if ($r["base_format"]): ?><span class="fmt"><?php echo html(strtoupper((string)$r["base_format"])); ?></span><?php endif; ?></td>
            <td><?php echo html($r["institution_name"] ?? "–"); ?></td>
            <td class="mono small dim"><?php echo html(substr((string)$r["fingerprint"], 0, 16)); ?>…</td>
            <td class="dim small tnum"><?php echo html($when); ?></td>
            <td style="text-align:right"><a class="btn btn-primary btn-sm" href="/reviews/<?php echo (int)$r["id"]; ?>">Prüfen</a></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
