<?php
/*
 * Auswahl der Tabellenblätter einer Arbeitsmappe. Erwartet: $import, $sheets, $error.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$csrf = Csrf::token();

$ERR = [
  "csrf"  => "Sitzung abgelaufen — bitte erneut absenden.",
  "leer"  => "Bitte mindestens ein Tabellenblatt auswählen.",
  "lesen" => "Ein Blatt konnte nicht herausgelöst werden. Steht in der Datei etwas Ungewöhnliches?",
];

$page_title = html($import->filename()) . " · Tabellenblätter";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs"><a href="/">Importe</a><span class="sep">/</span><span><?php echo html($import->filename()); ?></span>
    <span class="sep">/</span><span>Tabellenblätter</span></div>

  <?php if ($error !== null && isset($ERR[$error])): ?>
    <div class="alert" role="alert" style="margin-bottom:14px"><?php echo html($ERR[$error]); ?></div>
  <?php endif; ?>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px"><?php echo html($import->filename()); ?></h2>
    <span class="fmt">Excel</span>
    <span class="badge b-wait"><span class="bd"></span>Tabellenblatt wählen</span>
  </div>

  <p class="note" style="margin-bottom:14px">
    Die Datei enthält mehrere Tabellenblätter. Wähle aus, welche verarbeitet werden sollen —
    jedes gewählte Blatt wird ein eigener Import mit eigener Zuordnung. Deckblätter,
    Legenden und Auswertungen lässt du einfach weg.
  </p>

  <form method="post" action="/imports/<?php echo htmlattr($import->id()); ?>/sheets">
    <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">

    <div class="tablewrap">
      <table>
        <caption class="sr-only">Tabellenblätter der Arbeitsmappe</caption>
        <thead><tr>
          <th scope="col" style="width:56px"><span class="sr-only">Auswahl</span></th>
          <th scope="col">Tabellenblatt</th>
          <th scope="col">Zeilen</th>
          <th scope="col">Spalten</th>
          <th scope="col">Einschätzung</th>
        </tr></thead>
        <tbody>
        <?php foreach ($sheets as $i => $s):
          $usable = !empty($s["usable"]);
          $rows   = max(0, (int)$s["rows"] - 1);   // ohne Kopfzeile
        ?>
          <tr<?php echo $usable ? "" : ' class="row-ignored"'; ?>>
            <td>
              <input type="checkbox" name="sheets[]" id="sheet<?php echo (int)$i; ?>"
                     value="<?php echo htmlattr($s["name"]); ?>"
                     <?php echo $usable ? "checked" : ""; ?>>
            </td>
            <td><label class="fn" for="sheet<?php echo (int)$i; ?>" style="cursor:pointer"><?php echo html($s["name"]); ?></label></td>
            <td class="tnum"><?php echo $rows; ?></td>
            <td class="tnum"><?php echo (int)$s["cols"]; ?></td>
            <td class="dim small">
              <?php if ($usable): ?>
                sieht nach einer Tabelle aus
              <?php else: ?>
                zu wenig Inhalt für eine Tabelle — vermutlich Deckblatt oder Legende
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin-top:16px">
      <button class="btn btn-primary" type="submit">Ausgewählte Blätter verarbeiten</button>
      <a class="btn btn-outline" href="/">Abbrechen</a>
    </div>
  </form>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
