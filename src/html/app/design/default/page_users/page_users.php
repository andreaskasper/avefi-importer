<?php
/*
 * Usermanager-Liste (Admin). Erwartet: $users, $institutions, $self_id, $created, $error, $msg.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$csrf = Csrf::token();
$users        = $users ?? [];
$institutions = $institutions ?? [];

$errText = [
	"csrf"  => "Sitzung abgelaufen — bitte erneut absenden.",
	"email" => "Bitte eine gültige E-Mail-Adresse angeben.",
	"name"  => "Bitte einen Namen angeben.",
	"pw"    => "Das Passwort muss mindestens 8 Zeichen haben.",
	"dup"   => "Diese E-Mail-Adresse ist bereits vergeben.",
	"self"  => "Das eigene Konto kann nicht gesperrt oder gelöscht werden.",
];
$msgText = [
	"locked"   => "User gesperrt.",
	"unlocked" => "User entsperrt.",
	"deleted"  => "User gelöscht.",
];

$page_title = "Nutzerverwaltung · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <h2 style="font-size:19px;margin-bottom:14px">Nutzerverwaltung</h2>

  <?php if ($created): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px">User angelegt.</div><?php endif; ?>
  <?php if ($msg && isset($msgText[$msg])): ?><div class="alert alert-ok" role="status" style="margin-bottom:14px"><?php echo html($msgText[$msg]); ?></div><?php endif; ?>
  <?php if ($error && isset($errText[$error])): ?><div class="alert" role="alert" style="margin-bottom:14px"><?php echo html($errText[$error]); ?></div><?php endif; ?>

  <div class="card" style="margin-bottom:18px">
    <h3 style="font-size:15px;margin-bottom:14px">Neuen User anlegen</h3>
    <form method="post" action="/users" class="userform">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <div class="field"><label for="nu-email">E-Mail</label><input class="input" id="nu-email" type="email" name="email" required></div>
      <div class="field"><label for="nu-name">Name</label><input class="input" id="nu-name" name="name" required></div>
      <div class="field"><label for="nu-pw">Initial-Passwort</label><input class="input" id="nu-pw" type="text" name="password" minlength="8" required placeholder="min. 8 Zeichen"></div>
      <div class="field"><label for="nu-inst">Institution</label>
        <select class="input" id="nu-inst" name="institution_id">
          <option value="">— keine —</option>
          <?php foreach ($institutions as $inst): ?><option value="<?php echo (int)$inst["id"]; ?>"><?php echo html($inst["name"]); ?></option><?php endforeach; ?>
        </select>
      </div>
      <label class="checkline"><input type="checkbox" name="is_admin" value="1"> Administrator</label>
      <button class="btn btn-primary" type="submit">User anlegen</button>
    </form>
  </div>

  <div class="tablewrap">
    <table>
      <caption class="sr-only">Nutzerkonten mit Rolle, Status, Institution und Aktionen</caption>
      <thead><tr>
        <th scope="col">E-Mail</th><th scope="col">Name</th><th scope="col">Rolle</th><th scope="col">Status</th><th scope="col">Institution</th><th scope="col">Letzter Login</th><th scope="col" style="text-align:right">Aktion</th>
      </tr></thead>
      <tbody>
      <?php foreach ($users as $u):
        $uid    = (int)$u["id"];
        $isSelf = $uid === (int)$self_id;
        $active = (bool)$u["active"];
        $login  = $u["last_login_at"] ? date("d.m.Y · H:i", strtotime((string)$u["last_login_at"])) : "–";
      ?>
        <tr<?php echo $active ? "" : ' style="opacity:.6"'; ?>>
          <td class="fn"><?php echo html($u["email"]); ?><?php if ($isSelf): ?> <span class="dim small">(du)</span><?php endif; ?></td>
          <td><?php echo html($u["name"]); ?></td>
          <td><?php echo $u["is_admin"] ? '<span class="badge b-info">Admin</span>' : '<span class="dim">User</span>'; ?></td>
          <td><?php echo $active ? '<span class="badge b-ok"><span class="bd"></span>Aktiv</span>' : '<span class="badge b-danger"><span class="bd"></span>Gesperrt</span>'; ?></td>
          <td class="dim small"><?php echo html($u["institution_name"] ?? "–"); ?></td>
          <td class="dim small tnum"><?php echo html($login); ?></td>
          <td style="text-align:right">
            <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end">
              <a class="btn btn-outline btn-sm" href="/users/<?php echo $uid; ?>">Bearbeiten</a>
              <?php if (!$isSelf): ?>
                <form method="post" action="/users/<?php echo $uid; ?>" style="display:inline">
                  <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
                  <input type="hidden" name="action" value="<?php echo $active ? "lock" : "unlock"; ?>">
                  <button class="btn btn-outline btn-sm" type="submit"><?php echo $active ? "Sperren" : "Entsperren"; ?></button>
                </form>
                <form method="post" action="/users/<?php echo $uid; ?>" style="display:inline" data-confirm="Diesen User „<?php echo htmlattr($u['email']); ?>“ endgültig löschen?" data-confirm-title="User löschen" data-confirm-ok="Löschen" data-confirm-danger>
                  <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
                  <input type="hidden" name="action" value="delete">
                  <button class="iconbtn-del" type="submit" title="Löschen" aria-label="User „<?php echo htmlattr($u['email']); ?>“ löschen"><span aria-hidden="true">🗑</span></button>
                </form>
              <?php endif; ?>
            </div>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
