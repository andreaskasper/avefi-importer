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
$editedCounts = $instId !== null ? Import::editedCounts($instId) : [];   // import_id => Anzahl von Hand bearbeiteter Datensätze

$page_title = "Importe · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">

  <?php if (isset($_GET["added"])): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px">Import angelegt — die Datei wird im Hintergrund geladen und verarbeitet.</div><?php endif; ?>
  <?php if (isset($_GET["urlerror"])): ?><div class="alert" role="alert" style="margin-bottom:14px">URL konnte nicht übernommen werden (ungültig oder nicht erlaubt).</div><?php endif; ?>

  <div id="dropzone" class="dropzone" role="group" aria-label="Datei-Upload per Ablegen oder Auswählen"
       data-upload-url="/upload"
       data-csrf="<?php echo htmlattr($csrf); ?>"
       data-maxbytes="209715200">
    <input type="file" id="fileInput" multiple hidden aria-label="Metadaten-Dateien auswählen"
           accept=".csv,.tsv,.xml,.ead,.marcxml,.marc,.json">
    <div class="ic" aria-hidden="true">⬆</div>
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
    <span class="dim small" style="white-space:nowrap" id="urlLabel">oder per URL:</span>
    <input class="input" type="url" name="url" placeholder="https://…/metadaten.csv" required
           aria-labelledby="urlLabel" aria-label="Metadaten-URL">
    <button class="btn btn-outline btn-sm" type="submit">Von URL laden</button>
  </form>

  <div id="uploadList" class="upload-list" role="status" aria-live="polite" aria-label="Upload-Status" hidden></div>

  <div class="grid2" style="margin:16px 0">
    <div class="card kpi"><span class="v tnum"><?php echo $recCount; ?></span><span class="l">Datensätze konvertiert</span></div>
    <div class="card kpi"><span class="v tnum"><?php echo $awaiting; ?></span><span class="l">Wartet auf Format-Freigabe</span></div>
  </div>

  <?php if (empty($imports)): ?>
    <div class="tablewrap" id="importsTable">
      <div class="empty">
        <div class="ic" aria-hidden="true">📂</div>
        <div class="fn" style="font-size:15px;margin-bottom:4px">Noch keine Importe</div>
        <div class="small">Lade oben eine Metadaten-Datei hoch, um zu starten.</div>
      </div>
    </div>
  <?php else: ?>
    <div class="tablewrap" id="importsTable" data-import-actions data-csrf="<?php echo htmlattr($csrf); ?>">
      <table>
        <caption class="sr-only">Ihre Importe mit Format, Fortschritt, Verarbeitungsstatus und Aktionen</caption>
        <!-- Feste Breiten: lange Dateinamen sollen die Tabelle nicht über den Rand
             hinaus dehnen, sondern gekürzt werden (voller Name im Tooltip). -->
        <colgroup>
          <col style="width:27%"><col style="width:13%"><col style="width:12%">
          <col style="width:17%"><col style="width:9%"><col style="width:12%">
          <col style="width:154px">
        </colgroup>
        <thead><tr>
          <th scope="col">Datei</th><th scope="col">Format</th><th scope="col">Upload</th><th scope="col">Verarbeitung</th>
          <th scope="col">Datensätze</th><th scope="col">Hochgeladen</th><th scope="col" style="text-align:right">Aktion</th>
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
              <div class="fn" title="<?php echo htmlattr($imp->filename()); ?>"><?php echo html($imp->filename()); ?></div>
              <?php if ($sizeMb !== ""): ?><div class="dim small"><?php echo html($sizeMb); ?></div><?php endif; ?>
            </td>
            <?php $fmtLabel = $imp->detectedFormat() ?: ($imp->baseFormat() ? strtoupper($imp->baseFormat()) : null); ?>
            <td><?php if ($fmtLabel !== null): ?><span class="fmt" title="<?php echo htmlattr($fmtLabel); ?>"><?php echo html($fmtLabel); ?></span><?php else: ?><span class="dim">–</span><?php endif; ?></td>
            <td style="min-width:120px">
              <div class="prog <?php echo $progress >= 100 ? "ok" : "acc"; ?>" role="progressbar"
                   aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?php echo $progress; ?>"
                   aria-label="Upload-Fortschritt <?php echo $progress; ?> Prozent"><i style="width:<?php echo $progress; ?>%"></i></div>
              <div class="dim small tnum" aria-hidden="true"><?php echo $progress; ?> %</div>
            </td>
            <td><span class="badge <?php echo $badgeClass; ?>"><span class="bd"></span><?php echo html($badgeLabel); ?></span></td>
            <td class="tnum"><?php echo $imp->recordCount() > 0 ? $imp->recordCount() : '<span class="dim">–</span>'; ?></td>
            <td class="dim small tnum"><?php echo html($when); ?></td>
            <td style="text-align:right">
              <div class="rowactions">
                <?php if ($imp->status() === "error"): ?>
                  <a class="btn btn-outline btn-sm"
                     href="/imports/<?php echo htmlattr($imp->id()); ?>/details"
                     style="color:var(--danger);border-color:var(--danger)"
                     title="Fehlerdetails ansehen"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Details</a>
                <?php elseif ($imp->status() === "awaiting_format_review" && $imp->usesMapping()): ?>
                  <a class="btn btn-primary btn-sm" href="/imports/<?php echo htmlattr($imp->id()); ?>/mapping"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Zuordnen</a>
                <?php elseif ($isConverted): ?>
                  <a class="btn btn-primary btn-sm" href="/imports/<?php echo htmlattr($imp->id()); ?>/records"><i class="fa-solid fa-pen" aria-hidden="true"></i> Bearbeiten</a>
                <?php else: ?>
                  <span class="btn btn-outline btn-sm disabled" aria-disabled="true"><i class="fa-solid fa-pen" aria-hidden="true"></i> Bearbeiten</span>
                <?php endif; ?>

                <div class="rowmenu">
                  <button type="button" class="iconbtn-menu" data-menu-btn
                          aria-haspopup="true" aria-expanded="false"
                          aria-label="Weitere Aktionen für <?php echo htmlattr($imp->filename()); ?>"
                          title="Weitere Aktionen"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
                  <div class="menu menu-float" data-menu role="menu" hidden
                       aria-label="Aktionen für <?php echo htmlattr($imp->filename()); ?>">

                    <?php if ($imp->usesMapping() && $imp->status() !== "awaiting_format_review"): ?>
                      <a class="menu-item" role="menuitem" href="/imports/<?php echo htmlattr($imp->id()); ?>/mapping">
                        <span class="mi" aria-hidden="true"><i class="fa-solid fa-diagram-project"></i></span>Zuordnung ansehen</a>
                    <?php endif; ?>

                    <?php if ($imp->status() !== "error" && $imp->report() !== null): ?>
                      <a class="menu-item" role="menuitem" href="/imports/<?php echo htmlattr($imp->id()); ?>/report">
                        <span class="mi" aria-hidden="true"><i class="fa-solid fa-clipboard-check"></i></span>Prüfbericht<?php if ($imp->hasReportIssues()): ?> <span class="dim">· Beanstandungen</span><?php endif; ?></a>
                    <?php endif; ?>

                    <a class="menu-item" role="menuitem" href="/imports/<?php echo htmlattr($imp->id()); ?>/original">
                      <span class="mi" aria-hidden="true"><i class="fa-solid fa-file-arrow-down"></i></span>Original herunterladen</a>

                    <?php if ($isConverted): ?>
                      <a class="menu-item" role="menuitem" href="/imports/<?php echo htmlattr($imp->id()); ?>/avefi.json">
                        <span class="mi" aria-hidden="true"><i class="fa-solid fa-code"></i></span>AVefi-JSON herunterladen</a>
                    <?php endif; ?>

                    <?php if ($imp->canReconvert()): ?>
                      <button type="button" class="menu-item" role="menuitem"
                              data-action="reconvert" data-id="<?php echo htmlattr($imp->id()); ?>"
                              data-edited="<?php echo (int)($editedCounts[$imp->id()] ?? 0); ?>">
                        <span class="mi" aria-hidden="true"><i class="fa-solid fa-rotate"></i></span>Neu konvertieren</button>
                    <?php endif; ?>

                    <div class="menu-sep" role="separator"></div>

                    <button type="button" class="menu-item danger" role="menuitem"
                            data-action="delete" data-id="<?php echo htmlattr($imp->id()); ?>">
                      <span class="mi" aria-hidden="true"><i class="fa-solid fa-trash-can"></i></span>Löschen</button>
                  </div>
                </div>
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

</main>
<script src="<?php echo html(asset('/skins/upload.js')); ?>"></script>
<script src="<?php echo html(asset('/skins/imports.js')); ?>"></script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
