<?php
/*
 * Ein Mapping-Profil: Zuordnungen, Versionsverlauf, Umbenennen, Löschen.
 * Erwartet: $profile, $versions, $own.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$csrf = Csrf::token();
$m    = $profile->mapping();
$cols = is_array($m["columns"] ?? null) ? $m["columns"] : [];
$open = MappingProfile::openColumns($m);

$page_title = html($profile->name()) . " · Zuordnung";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs"><a href="/mappings">Zuordnungen</a><span class="sep">/</span><span><?php echo html($profile->name()); ?></span></div>

  <?php if (isset($_GET["msg"])): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px">Gespeichert.</div><?php endif; ?>
  <?php if (isset($_GET["error"])): ?><div class="alert" role="alert" style="margin-bottom:14px">Das hat nicht geklappt.</div><?php endif; ?>

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
