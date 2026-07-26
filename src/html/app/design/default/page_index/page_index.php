<?php
/*
 * Import-Übersicht (Dashboard). Erwartet: $active.
 * Datei-Upload (Dropzone) + Import-Liste der eigenen Institution.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$me     = MyUser::current();
$instId = $me ? $me->institutionId() : null;
$csrf   = Csrf::token();

$imports  = $instId !== null ? Import::forInstitution($instId) : [];
$recCount = $instId !== null ? Import::countRecordsForInstitution($instId) : 0;
$awaiting = $instId !== null ? Import::countAwaitingForInstitution($instId) : 0;

$page_title = "Importe · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap">

  <?php if (isset($_GET["added"])): ?><div class="alert alert-ok" style="margin-bottom:14px">Import angelegt — die Datei wird im Hintergrund geladen und verarbeitet.</div><?php endif; ?>
  <?php if (isset($_GET["urlerror"])): ?><div class="alert" style="margin-bottom:14px">URL konnte nicht übernommen werden (ungültig oder nicht erlaubt).</div><?php endif; ?>

  <div id="dropzone" class="dropzone"
       data-upload-url="/upload"
       data-csrf="<?php echo htmlattr($csrf); ?>"
       data-maxbytes="209715200">
    <input type="file" id="fileInput" multiple hidden
           accept=".csv,.tsv,.xml,.ead,.marcxml,.marc,.json">
    <div class="ic">⬆</div>
    <h3>Dateien hier ablegen oder auswählen</h3>
    <p>Mehrere Dateien möglich · max. 200 MB · Format wird automatisch erkannt</p>
    <div class="formats">
      <span class="fmt">CSV</span><span class="fmt">TSV</span><span class="fmt">XML</span>
      <span class="fmt">EAD</span><span class="fmt">MARC-XML</span><span class="fmt">JSON</span>
    </div>
    <button type="button" class="btn btn-outline btn-sm" id="pickBtn" style="margin-top:14px">Dateien auswählen</button>
  </div>

  <form class="urlform" method="post" action="/upload/url">
    <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
    <span class="dim small" style="white-space:nowrap">oder per URL:</span>
    <input class="input" type="url" name="url" placeholder="https://…/metadaten.csv" required>
    <button class="btn btn-outline btn-sm" type="submit">Von URL laden</button>
  </form>

  <div id="uploadList" class="upload-list" hidden></div>

  <div class="grid2" style="margin:16px 0">
    <div class="card kpi"><span class="v tnum"><?php echo $recCount; ?></span><span class="l">Datensätze konvertiert</span></div>
    <div class="card kpi"><span class="v tnum"><?php echo $awaiting; ?></span><span class="l">Wartet auf Format-Freigabe</span></div>
  </div>

  <?php if (empty($imports)): ?>
    <div class="tablewrap" id="importsTable">
      <div class="empty">
        <div class="ic">📂</div>
        <div class="fn" style="font-size:15px;margin-bottom:4px">Noch keine Importe</div>
        <div class="small">Lade oben eine Metadaten-Datei hoch, um zu starten.</div>
      </div>
    </div>
  <?php else: ?>
    <div class="tablewrap" id="importsTable">
      <table>
        <thead><tr>
          <th>Datei</th><th>Format</th><th>Upload</th><th>Verarbeitung</th>
          <th>Datensätze</th><th>Hochgeladen</th><th style="text-align:right">Aktion</th>
        </tr></thead>
        <tbody>
        <?php foreach ($imports as $imp):
          [$badgeClass, $badgeLabel] = $imp->statusBadge();
          $progress    = max(0, min(100, $imp->uploadProgress()));
          $isConverted = $imp->status() === "converted";
          $when        = $imp->createdAt() ? date("d.m.Y · H:i", strtotime($imp->createdAt())) : "";
          $sizeMb      = $imp->filesize() ? number_format($imp->filesize() / 1048576, 1, ",", ".") . " MB" : "";
        ?>
          <tr data-import-id="<?php echo htmlattr($imp->id()); ?>">
            <td>
              <div class="fn"><?php echo html($imp->filename()); ?></div>
              <?php if ($sizeMb !== ""): ?><div class="dim small"><?php echo html($sizeMb); ?></div><?php endif; ?>
            </td>
            <td><?php if ($imp->baseFormat()): ?><span class="fmt"><?php echo html(strtoupper($imp->baseFormat())); ?></span><?php else: ?><span class="dim">–</span><?php endif; ?></td>
            <td style="min-width:120px">
              <div class="prog <?php echo $progress >= 100 ? "ok" : "acc"; ?>"><i style="width:<?php echo $progress; ?>%"></i></div>
              <div class="dim small tnum"><?php echo $progress; ?> %</div>
            </td>
            <td><span class="badge <?php echo $badgeClass; ?>"><span class="bd"></span><?php echo html($badgeLabel); ?></span></td>
            <td class="tnum"><?php echo $imp->recordCount() > 0 ? $imp->recordCount() : '<span class="dim">–</span>'; ?></td>
            <td class="dim small tnum"><?php echo html($when); ?></td>
            <td style="text-align:right">
              <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end">
                <?php if ($isConverted): ?>
                  <a class="btn btn-primary btn-sm" href="/imports/<?php echo htmlattr($imp->id()); ?>/records">✎ Bearbeiten</a>
                <?php else: ?>
                  <span class="btn btn-outline btn-sm disabled">✎ Bearbeiten</span>
                <?php endif; ?>
                <button type="button" class="iconbtn-del" data-del="<?php echo htmlattr($imp->id()); ?>"
                        title="Import löschen" aria-label="Import löschen">🗑</button>
              </div>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>

  <div class="legend">
    <h3>Verarbeitungs-Pipeline</h3>
    <div class="flow">
      <span class="step">Upload</span><span class="arr">→</span>
      <span class="step">Wartend</span><span class="arr">→</span>
      <span class="step">Format-Erkennung</span><span class="arr">→</span>
      <span class="step branch">Format unbekannt → Review / Admin-Mail</span><span class="arr">→</span>
      <span class="step">Konvertierung</span><span class="arr">→</span>
      <span class="step">Konvertiert · editierbar</span>
    </div>
    <p class="note">Nach dem Upload liegt der Import auf „Wartend" — die Format-Erkennung und Konvertierung übernimmt der Worker.</p>
  </div>

  <form id="deleteForm" method="post" action="/import/delete" hidden>
    <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
    <input type="hidden" name="id" value="">
  </form>

</main>
<script src="<?php echo html(asset('/skins/upload.js')); ?>"></script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
