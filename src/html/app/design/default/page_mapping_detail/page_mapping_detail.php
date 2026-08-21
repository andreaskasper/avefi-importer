<?php
/*
 * Ein Mapping-Profil: Zuordnungen, Versionsverlauf, Umbenennen, Löschen.
 * Erwartet: $profile, $versions, $own.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$csrf   = Csrf::token();
$sample = $profile->sample();
$m      = $profile->mapping();

$MSG = [
  "renamed"          => "Profil umbenannt.",
  "restored"         => "Frühere Fassung wiederhergestellt.",
  "updated"          => "Profil aus der Datei aktualisiert.",
  "imported"         => "Profil aus der Datei angelegt.",
  "imported_nosample" => "Profil angelegt. Die Datei enthielt keine Beispieldaten — reiche unten eine passende Tabelle nach, dann lässt sich die Zuordnung bearbeiten.",
];
$ERR = [
  "csrf"     => "Sitzung abgelaufen — bitte erneut absenden.",
  "version"  => "Diese Fassung ließ sich nicht wiederherstellen.",
  "upload"   => "Die Datei konnte nicht gelesen werden.",
  "parse"    => "Aus der Datei ließ sich keine Kopfzeile mit mehreren Spalten lesen. Erwartet wird eine CSV- oder TSV-Datei.",
  "jsonhier" => "Das ist eine JSON-Datei. Hier gehört die Tabelle hin, aus der das Profil gebaut wurde — ein exportiertes Profil liest du über „Zuordnungen“ ein.",
  "hash"     => "Die Kopfzeile dieser Datei passt nicht zu diesem Profil. Die Spaltennamen müssen dieselben sein.",
  "nosample" => "Für dieses Profil sind keine Beispieldaten hinterlegt — ohne sie kann der Editor keine Vorschau rechnen. Reiche unten eine passende Tabelle nach.",
];
$cols = is_array($m["columns"] ?? null) ? $m["columns"] : [];
$open = MappingProfile::openColumns($m);

$page_title = html($profile->name()) . " · Zuordnung";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs"><a href="/mappings">Zuordnungen</a><span class="sep">/</span><span><?php echo html($profile->name()); ?></span></div>

  <?php if ($msg !== null): ?>
    <div class="alert alert-ok" role="status" style="margin-bottom:14px"><?php echo html($MSG[$msg] ?? "Gespeichert."); ?></div>
  <?php endif; ?>
  <?php if ($error !== null): ?>
    <div class="alert" role="alert" style="margin-bottom:14px"><?php echo html($ERR[$error] ?? "Das hat nicht geklappt."); ?></div>
  <?php endif; ?>

  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <h2 style="font-size:19px"><?php echo html($profile->name()); ?></h2>
    <span class="fmt"><?php echo html(strtoupper($profile->baseFormat())); ?></span>
    <span class="badge <?php echo $profile->isComplete() ? "b-ok" : "b-wait"; ?>"><span class="bd"></span>
      <?php echo $profile->isComplete() ? "vollständig" : count($open) . " Spalte(n) offen"; ?></span>
    <span class="dim small">Fassung <?php echo $profile->version(); ?></span>
  </div>

  <div class="grid2" style="align-items:start">
    <div class="card">
      <h4 class="side-h" style="margin-bottom:12px">Zuordnungen</h4>
      <?php if (empty($cols)): ?>
        <p class="dim small" style="margin:0">Keine Spalten hinterlegt.</p>
      <?php else: ?>
        <div class="tablewrap" style="border:0">
          <table>
            <thead><tr><th scope="col">Spalte</th><th scope="col">Ziel</th><th scope="col">Kette</th></tr></thead>
            <tbody>
            <?php foreach ($cols as $name => $spec):
              $ignored = !empty($spec["ignore"]);
              $targets = is_array($spec["targets"] ?? null) ? $spec["targets"] : [];
              $pre     = is_array($spec["pre"] ?? null) ? $spec["pre"] : [];
            ?>
              <tr>
                <td class="fn"><?php echo html((string)$name); ?></td>
                <td>
                  <?php if ($ignored): ?><span class="dim">ignoriert</span>
                  <?php elseif (!$targets): ?><span class="badge b-wait"><span class="bd"></span>offen</span>
                  <?php else: foreach ($targets as $t):
                    $tc = TargetCatalog::get((string)($t["target"] ?? "")); ?>
                    <div><?php echo $tc !== null
                      ? html(TargetCatalog::levelLabel($tc["level"]) . " › " . $tc["label"])
                      : '<span class="dim">' . html((string)($t["target"] ?? "?")) . '</span>'; ?></div>
                  <?php endforeach; endif; ?>
                </td>
                <td class="dim small">
                  <?php
                    $ops = array_map(fn($s) => (string)($s["op"] ?? "?"), $pre);
                    foreach ($targets as $t) foreach ((array)($t["post"] ?? []) as $s) $ops[] = (string)($s["op"] ?? "?");
                    echo $ops ? html(implode(" → ", $ops)) : "–";
                  ?>
                </td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">
      <?php if ($own && $sample === null): ?>
        <div class="card" style="border-color:var(--warn)">
          <h4 class="side-h" style="margin-bottom:8px">Beispieldaten fehlen</h4>
          <p class="note" style="margin:0 0 10px">
            Der Editor rechnet die Vorschau auf echten Zeilen. Für dieses Profil sind keine
            hinterlegt — das passiert bei Profilen aus einem älteren Export. Lade die Tabelle
            hoch, für die das Profil gilt; gespeichert werden daraus nur die Spaltennamen und
            einige Beispielzeilen.
          </p>
          <form method="post" action="/mappings/<?php echo $profile->id(); ?>/sample"
                enctype="multipart/form-data" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
            <input class="input" type="file" name="sample" accept=".csv,.tsv,.tab,text/csv" required
                   aria-label="Passende Tabelle auswählen" style="max-width:250px">
            <button class="btn btn-primary btn-sm" type="submit">Nachreichen</button>
          </form>
        </div>
      <?php endif; ?>

      <div class="card">
        <h4 class="side-h" style="margin-bottom:12px">Verwaltung</h4>
        <?php if ($own): ?>
          <form method="post" action="/mappings/<?php echo $profile->id(); ?>" class="stackform" style="margin-bottom:14px">
            <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
            <input type="hidden" name="action" value="rename">
            <div class="field" style="width:100%">
              <label for="pname">Name</label>
              <input class="input" id="pname" name="name" value="<?php echo htmlattr($profile->name()); ?>" required>
            </div>
            <button class="btn btn-outline btn-sm" type="submit">Umbenennen</button>
          </form>
        <?php else: ?>
          <p class="note">Dieses Profil gehört einer anderen Einrichtung. Beim Zuordnen einer eigenen Datei
          kannst du es übernehmen — es wird dabei kopiert.</p>
        <?php endif; ?>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <?php if ($own && $sample !== null): ?>
            <a class="btn btn-primary btn-sm" href="/mappings/<?php echo $profile->id(); ?>/edit">
              <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Zuordnung bearbeiten</a>
          <?php endif; ?>
          <a class="btn btn-outline btn-sm" href="/mappings/<?php echo $profile->id(); ?>/export">
            <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Exportieren</a>
          <?php if ($own): ?>
            <form method="post" action="/mappings/<?php echo $profile->id(); ?>"
                  data-confirm="Dieses Profil wirklich löschen? Bereits konvertierte Importe bleiben erhalten, künftige Uploads mit dieser Kopfzeile brauchen wieder eine Zuordnung."
                  data-confirm-title="Profil löschen" data-confirm-ok="Löschen" data-confirm-danger>
              <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
              <input type="hidden" name="action" value="delete">
              <button class="btn btn-outline btn-sm" type="submit" style="color:var(--danger);border-color:var(--danger)">Löschen</button>
            </form>
          <?php endif; ?>
        </div>
      </div>

      <div class="card">
        <h4 class="side-h" style="margin-bottom:12px">Verlauf</h4>
        <?php if (empty($versions)): ?>
          <p class="dim small" style="margin:0">Kein Verlauf vorhanden.</p>
        <?php else: foreach ($versions as $v): ?>
          <div class="frow" style="grid-template-columns:1fr auto;padding:8px 0;align-items:center">
            <div>
              <div class="fn">Fassung <?php echo (int)$v["version"]; ?></div>
              <div class="dim small">
                <?php echo html($v["created_at"] ? date("d.m.Y · H:i", strtotime((string)$v["created_at"])) : ""); ?>
                <?php if (!empty($v["user_name"])) echo " · " . html($v["user_name"]); ?>
              </div>
            </div>
            <?php if ($own && (int)$v["version"] !== $profile->version()): ?>
              <form method="post" action="/mappings/<?php echo $profile->id(); ?>"
                    data-confirm="Diese Fassung wieder aktivieren? Der aktuelle Stand bleibt als frühere Fassung im Verlauf."
                    data-confirm-title="Fassung wiederherstellen" data-confirm-ok="Wiederherstellen">
                <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
                <input type="hidden" name="action" value="restore">
                <input type="hidden" name="version" value="<?php echo (int)$v["version"]; ?>">
                <button class="btn btn-outline btn-sm" type="submit">Wiederherstellen</button>
              </form>
            <?php elseif ((int)$v["version"] === $profile->version()): ?>
              <span class="badge b-ok"><span class="bd"></span>aktiv</span>
            <?php endif; ?>
          </div>
        <?php endforeach; endif; ?>
      </div>
    </div>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
