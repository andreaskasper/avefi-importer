<?php
/*
 * Format-Review-Detail (Admin, Screen 5). Erwartet: $review, $import, $profiles, $error.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$csrf = Csrf::token();
$rid  = (int)$review["id"];
$fp   = (string)$review["fingerprint"];
$when = $review["uploaded_at"] ? date("d.m.Y · H:i", strtotime((string)$review["uploaded_at"])) : "";

$sj      = json_decode((string)($review["sample_json"] ?? "{}"), true) ?: [];
$columns = is_array($sj["columns"] ?? null) ? $sj["columns"] : [];
$rows    = (isset($sj["sample"]) && is_array($sj["sample"]) && array_is_list($sj["sample"])) ? $sj["sample"] : [];
$xmlInfo = (isset($sj["sample"]["root"])) ? $sj["sample"] : null;

/* Converter-Auswahl: generische + bereits bekannte Profile. */
$options = ConverterFactory::available();
foreach ($profiles as $p) $options[(string)$p["converter_key"]] = (string)$p["label"];

$page_title = html($review["filename"]) . " · Format-Review";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs"><a href="/reviews">Format-Review</a><span class="sep">/</span><span><?php echo html($review["filename"]); ?></span></div>

  <?php if ($error === "csrf"): ?><div class="alert" style="margin-bottom:14px">Sitzung abgelaufen — bitte erneut absenden.</div><?php endif; ?>
  <?php if ($error === "converter"): ?><div class="alert" style="margin-bottom:14px">Bitte einen gültigen Converter wählen.</div><?php endif; ?>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px"><?php echo html($review["filename"]); ?></h2>
    <?php if ($review["base_format"]): ?><span class="fmt"><?php echo html(strtoupper((string)$review["base_format"])); ?></span><?php endif; ?>
    <span class="badge b-wait"><span class="bd"></span>Neues Format – Review nötig</span>
    <span class="dim small">Hochgeladen von <b><?php echo html($review["institution_name"] ?? "–"); ?></b> · <?php echo html($when); ?></span>
  </div>

  <div class="grid2" style="align-items:start">
    <!-- Erkennung -->
    <div class="card">
      <h4 class="side-h" style="margin-bottom:12px">Erkennung</h4>
      <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0"><label>Basis-Format</label><div class="fval"><span class="fmt"><?php echo html(strtoupper((string)($review["base_format"] ?? "?"))); ?></span></div></div>
      <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0"><label>Fingerprint</label><div class="fval mono small" style="word-break:break-all"><?php echo html($fp); ?></div></div>
      <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0"><label>Registry-Treffer</label><div class="fval"><span class="badge b-danger"><span class="bd"></span>Kein Converter</span></div></div>
      <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0;border-bottom:0"><label>Spalten/Elemente</label><div class="fval tnum"><?php echo count($columns); ?></div></div>
      <p class="note">Import pausiert. Fingerprint kann in <span class="mono">FingerprintRegistry</span> hinterlegt werden, sobald ein Converter existiert.</p>
    </div>

    <!-- Auflösung -->
    <div class="card">
      <h4 class="side-h" style="margin-bottom:12px">Auflösung</h4>
      <div style="display:flex;flex-direction:column;gap:12px">
        <form method="post" action="/reviews/<?php echo $rid; ?>" style="border:1px solid var(--border);border-radius:9px;padding:12px">
          <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
          <input type="hidden" name="action" value="assign">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:6px">Converter zuordnen &amp; konvertieren</div>
          <p class="note" style="margin:0 0 8px">Diesen Import mit einem vorhandenen Converter verarbeiten.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select class="input" name="converter_key" required style="max-width:260px">
              <?php foreach ($options as $key => $label): ?>
                <option value="<?php echo htmlattr($key); ?>"><?php echo html($label); ?> (<?php echo html($key); ?>)</option>
              <?php endforeach; ?>
            </select>
            <button class="btn btn-primary btn-sm" type="submit">Zuordnen</button>
          </div>
        </form>

        <div style="display:flex;gap:8px;align-items:center">
          <a class="btn btn-outline btn-sm" href="/imports/<?php echo htmlattr((string)$review["import_id"]); ?>/original">⬇ Datei herunterladen</a>
          <form method="post" action="/reviews/<?php echo $rid; ?>" data-confirm="Diesen Import wirklich ablehnen? Der Import wird verworfen." data-confirm-title="Import ablehnen" data-confirm-ok="Ablehnen" data-confirm-danger style="margin-left:auto">
            <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
            <input type="hidden" name="action" value="reject">
            <button class="btn btn-outline btn-sm" type="submit">Ablehnen</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- Vorschau -->
  <div style="margin-top:16px">
    <h4 class="side-h" style="margin-bottom:9px">Struktur-Vorschau <span class="dim" style="text-transform:none;letter-spacing:0">(Grundlage für die Converter-Klasse)</span></h4>
    <?php if ($xmlInfo !== null): ?>
      <div class="card">
        <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0"><label>Root-Element</label><div class="fval mono small"><?php echo html($xmlInfo["root"] ?? ""); ?></div></div>
        <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0"><label>Namespace</label><div class="fval mono small"><?php echo html($xmlInfo["namespace"] ?? "") ?: '<span class="dim">–</span>'; ?></div></div>
        <div class="frow" style="grid-template-columns:130px 1fr;padding:8px 0;border-bottom:0"><label>Kind-Elemente</label><div class="fval"><?php foreach (($xmlInfo["children"] ?? []) as $c): ?><span class="fmt" style="margin:0 4px 4px 0;display:inline-block"><?php echo html($c); ?></span><?php endforeach; ?></div></div>
      </div>
    <?php elseif ($columns): ?>
      <div class="tablewrap">
        <table>
          <thead><tr><?php foreach ($columns as $c): ?><th><?php echo html((string)$c); ?></th><?php endforeach; ?></tr></thead>
          <tbody>
            <?php foreach (array_slice($rows, 0, 3) as $row): ?>
              <tr>
                <?php if (is_array($row)): foreach ($columns as $i => $c): ?>
                  <td class="small"><?php echo html((string)($row[$i] ?? ($row[$c] ?? ""))); ?></td>
                <?php endforeach; else: ?>
                  <td class="small" colspan="<?php echo max(1, count($columns)); ?>"><?php echo html((string)$row); ?></td>
                <?php endif; ?>
              </tr>
            <?php endforeach; ?>
            <?php if (empty($rows)): ?><tr><td class="dim" colspan="<?php echo max(1, count($columns)); ?>">Keine Datenzeilen in der Probe.</td></tr><?php endif; ?>
          </tbody>
        </table>
      </div>
    <?php else: ?>
      <div class="card"><p class="dim small" style="margin:0">Keine Struktur-Probe verfügbar.</p></div>
    <?php endif; ?>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
