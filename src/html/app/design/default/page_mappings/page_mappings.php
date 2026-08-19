<?php
/*
 * Übersicht aller Mapping-Profile. Eigene zuerst, fremde darunter.
 * Erwartet: $profiles, $ownInst, $msg, $error.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$csrf = Csrf::token();

$MSG = [
  "renamed"  => "Profil umbenannt.",
  "deleted"  => "Profil gelöscht.",
  "imported" => "Profil aus der Datei angelegt.",
  "updated"  => "Vorhandenes Profil aus der Datei aktualisiert.",
  "restored" => "Frühere Fassung wiederhergestellt.",
  "new"      => "Profil angelegt — ordne jetzt die Spalten zu.",
  "exists"   => "Für diese Kopfzeile gibt es bereits ein Profil. Die Beispieldaten wurden aufgefrischt.",
];
$ERR = [
  "csrf"   => "Sitzung abgelaufen — bitte erneut absenden.",
  "fremd"  => "Dieses Profil gehört einer anderen Einrichtung und kann hier nicht geändert werden.",
  "upload" => "Die Datei konnte nicht gelesen werden.",
  "format" => "Das ist keine gültige Profil-Datei (erwartet wird ein Export aus diesem Importer).",
  "parse"  => "Aus der Datei ließ sich keine Kopfzeile lesen. Erwartet wird eine CSV- oder TSV-Datei mit Spaltennamen in der ersten Zeile.",
  "nosample" => "Für dieses Profil sind keine Beispieldaten hinterlegt — lade eine passende Datei hoch, um es zu bearbeiten.",
];

$page_title = "Zuordnungen · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <h2 style="font-size:19px">Zuordnungen</h2>
    <span class="dim small"><?php echo count($profiles); ?> Profile</span>
  </div>

  <?php if ($msg !== null && isset($MSG[$msg])): ?>
    <div class="alert alert-ok" role="status" style="margin-bottom:14px"><?php echo html($MSG[$msg]); ?></div>
  <?php endif; ?>
  <?php if ($error !== null && isset($ERR[$error])): ?>
    <div class="alert" role="alert" style="margin-bottom:14px"><?php echo html($ERR[$error]); ?></div>
  <?php endif; ?>

  <div class="newprofile">
    <h3>Neue Zuordnung anlegen</h3>
    <p class="note" style="margin:0">
      Wähle eine Beispieldatei (CSV oder TSV) mit der Kopfzeile, für die die Zuordnung gelten soll.
      Der Editor öffnet sich mit deinen echten Spalten und Werten. Die Datei wird nur gelesen —
      gespeichert werden die Spaltennamen und einige Beispielzeilen für die Vorschau.
    </p>
    <form method="post" action="/mappings/new" enctype="multipart/form-data" class="row">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <input class="input" type="file" name="sample" accept=".csv,.tsv,.tab,text/csv" required
             aria-label="Beispieldatei auswählen" style="max-width:320px">
      <button class="btn btn-primary btn-sm" type="submit">
        <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Zuordnung beginnen</button>
    </form>
    <details style="margin-top:12px">
      <summary class="dim small" style="cursor:pointer">Stattdessen ein exportiertes Profil einlesen</summary>
      <form method="post" action="/mappings" enctype="multipart/form-data" class="row">
        <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
        <input class="input" type="file" name="file" accept=".json,application/json" required
               aria-label="Profil-Datei auswählen" style="max-width:320px">
        <button class="btn btn-outline btn-sm" type="submit">Profil-JSON importieren</button>
      </form>
    </details>
  </div>

  <?php if (empty($profiles)): ?>
    <div class="tablewrap"><div class="empty">
      <div class="ic" aria-hidden="true">🗺</div>
      <div class="fn" style="font-size:15px;margin-bottom:4px">Noch keine Zuordnungen</div>
      <div class="small">Lade oben eine Beispieldatei hoch, um die erste anzulegen.</div>
    </div></div>
  <?php else: ?>
    <div class="tablewrap">
      <table>
        <caption class="sr-only">Gespeicherte Mapping-Profile</caption>
        <thead><tr>
          <th scope="col">Name</th><th scope="col">Einrichtung</th><th scope="col">Basis</th>
          <th scope="col">Zustand</th><th scope="col">Verwendet</th><th scope="col">Geändert</th>
          <th scope="col" style="text-align:right">Aktion</th>
        </tr></thead>
        <tbody>
        <?php foreach ($profiles as $p):
          $own      = ((int)$p["institution_id"] === (int)$ownInst);
          $complete = in_array($p["complete"], [true, "t", "1", 1], true);
          $when     = $p["updated_at"] ? date("d.m.Y", strtotime((string)$p["updated_at"])) : "";
        ?>
          <tr>
            <td>
              <div class="fn"><?php echo html($p["name"]); ?></div>
              <div class="dim small">Fassung <?php echo (int)$p["version"]; ?><?php
                if (!empty($p["user_name"])) echo " · angelegt von " . html($p["user_name"]); ?></div>
            </td>
            <td><?php echo html($p["institution_name"] ?? "–"); ?><?php if ($own): ?>
              <span class="fmt" style="margin-left:6px">eigene</span><?php endif; ?></td>
            <td><span class="fmt"><?php echo html(strtoupper((string)$p["base_format"])); ?></span></td>
            <td><?php if ($complete): ?>
                  <span class="badge b-ok"><span class="bd"></span>vollständig</span>
                <?php else: ?>
                  <span class="badge b-wait"><span class="bd"></span>unvollständig</span>
                <?php endif; ?></td>
            <td class="tnum"><?php echo (int)$p["use_count"]; ?> <span class="dim small">Importe</span></td>
            <td class="dim small tnum"><?php echo html($when); ?></td>
            <td style="text-align:right">
              <div class="rowactions">
                <?php if ($own): ?>
                  <a class="btn btn-primary btn-sm" href="/mappings/<?php echo (int)$p["id"]; ?>/edit">
                    <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Bearbeiten</a>
                <?php endif; ?>
                <a class="btn btn-outline btn-sm" href="/mappings/<?php echo (int)$p["id"]; ?>">Ansehen</a>
                <a class="btn btn-outline btn-sm" href="/mappings/<?php echo (int)$p["id"]; ?>/export"
                   title="Als JSON exportieren"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i></a>
              </div>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>

  <p class="note" style="margin-top:14px">
    Profile sind für alle Einrichtungen sichtbar. Wird eine Datei mit einer bereits bekannten
    Kopfzeile hochgeladen, greift zuerst das eigene Profil; fremde werden zur Übernahme angeboten
    und dabei kopiert, damit Änderungen keine fremden Importe verändern.
  </p>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
