<?php
/*
 * Datensatz-Liste eines Imports (Screen 3). Erwartet: $import (Import), $records (rows).
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

[$badgeClass, $badgeLabel] = $import->statusBadge();
$page_title = html($import->filename()) . " · Datensätze";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs">
    <a href="/">Importe</a><span class="sep">/</span><span><?php echo html($import->filename()); ?></span>
    <span class="sep">/</span><span>Datensätze</span>
  </div>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px"><?php echo html($import->filename()); ?></h2>
    <?php if ($import->baseFormat()): ?><span class="fmt"><?php echo html(strtoupper($import->baseFormat())); ?></span><?php endif; ?>
    <span class="badge <?php echo $badgeClass; ?>"><span class="bd"></span><?php echo html($badgeLabel); ?></span>
    <span class="dim small">
      <?php if ($import->profileLabel()): ?>Mapping: <b><?php echo html($import->profileLabel()); ?></b> · <?php endif; ?>
      <?php echo count($records); ?> Werk<?php echo count($records) === 1 ? "" : "e"; ?>
    </span>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <input class="input" id="recSearch" placeholder="🔍 Titel, PID suchen…" aria-label="Datensätze nach Titel oder PID durchsuchen" style="width:220px;padding:7px 11px;font-size:13px">
      <a class="btn btn-outline btn-sm" href="/imports/<?php echo htmlattr($import->id()); ?>/avefi.json"><span aria-hidden="true">⬇</span> AVefi-JSON</a>
    </div>
  </div>

  <?php if (empty($records)): ?>
    <div class="tablewrap"><div class="empty">
      <div class="ic" aria-hidden="true">🎬</div>
      <div class="fn" style="font-size:15px;margin-bottom:4px">Noch keine Datensätze</div>
      <div class="small">Dieser Import ist noch nicht konvertiert oder hat keine Werke erzeugt.</div>
    </div></div>
  <?php else: ?>
    <div class="tablewrap">
      <table>
        <caption class="sr-only">Erzeugte AVefi-Werke mit Jahr, Typ, PID, Vollständigkeit und Aktion</caption>
        <thead><tr>
          <th scope="col">Titel</th><th scope="col">Jahr</th><th scope="col">Typ</th><th scope="col">AVefi-PID</th>
          <th scope="col">Manif. / Exempl.</th><th scope="col">Vollständigkeit</th><th scope="col" style="text-align:right">Aktion</th>
        </tr></thead>
        <tbody>
        <?php foreach ($records as $r):
          $data = json_decode((string)($r["data_json"] ?? "{}"), true) ?: [];
          $canonical = AvefiMapper::canonical($data, "rec" . (int)$r["id"]);
          $valid = true;
          foreach (AvefiMapper::validateSet(AvefiMapper::flatten($canonical)) as $v) if (!empty($v["errors"])) { $valid = false; break; }
          $contribs = [];
          foreach (($canonical["work"]["has_event"] ?? []) as $ev)
            foreach (($ev["has_activity"] ?? []) as $act)
              foreach (($act["has_agent"] ?? []) as $ag)
                if (!empty($ag["has_name"])) $contribs[] = $ag["has_name"];
          $pct   = (int)$r["completeness"];
          $ring  = Completeness::ringClass($pct);
          $title = trim((string)($r["work_title"] ?? "")) !== "" ? $r["work_title"] : "Ohne Titel";
          $editUrl = "/imports/" . $import->id() . "/records/" . (int)$r["id"] . "/edit";
        ?>
          <tr data-search="<?php echo htmlattr(mb_strtolower($title . " " . implode(" ", $contribs) . " " . ($r["avefi_pid"] ?? ""))); ?>">
            <td>
              <div class="fn"><?php echo html($title); ?><?php if (!$valid): ?> <span class="badge b-danger" style="padding:1px 7px" title="Entspricht noch nicht dem Schema">ungültig</span><?php endif; ?></div>
              <?php if ($contribs): ?><div class="dim small"><?php echo html(implode(", ", $contribs)); ?></div><?php endif; ?>
            </td>
            <td class="tnum"><?php echo $r["work_year"] ? (int)$r["work_year"] : '<span class="dim">–</span>'; ?></td>
            <td><?php echo $r["work_type"] ? '<span class="badge b-neutral">' . html($r["work_type"]) . '</span>' : '<span class="dim">unbestimmt</span>'; ?></td>
            <td class="mono small"><?php echo $r["avefi_pid"] ? html($r["avefi_pid"]) : '<span class="dim">noch keine</span>'; ?></td>
            <td class="tnum small"><?php echo (int)$r["manifestation_count"]; ?> / <?php echo (int)$r["item_count"]; ?></td>
            <td><div class="ring <?php echo $ring; ?>" style="--p:<?php echo $pct; ?>" role="img" aria-label="Vollständigkeit <?php echo $pct; ?> Prozent"><span aria-hidden="true"><?php echo $pct; ?>%</span></div></td>
            <td style="text-align:right"><a class="btn btn-primary btn-sm" href="<?php echo htmlattr($editUrl); ?>"><span aria-hidden="true">✎</span> Bearbeiten</a></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <p class="note">Vollständigkeit = Anteil ausgefüllter Pflicht- &amp; empfohlener Felder. Rot &lt; 50 %, Gelb &lt; 80 %, Grün ≥ 80 %.</p>
  <?php endif; ?>
</main>
<script>
  (function(){
    var q = document.getElementById("recSearch");
    if(!q) return;
    q.addEventListener("input", function(){
      var t = q.value.trim().toLowerCase();
      document.querySelectorAll("tbody tr[data-search]").forEach(function(tr){
        tr.style.display = (!t || tr.getAttribute("data-search").indexOf(t) !== -1) ? "" : "none";
      });
    });
  })();
</script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
