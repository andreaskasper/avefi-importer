<?php
/*
 * Usermanager-Bearbeiten (Admin). Erwartet: $user (User), $institutions, $is_self, $saved, $error.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$csrf = Csrf::token();
$institutions = $institutions ?? [];
$errText = [
	"csrf" => "Sitzung abgelaufen — bitte erneut absenden.",
	"name" => "Bitte einen Namen angeben.",
	"pw"   => "Das Passwort muss mindestens 8 Zeichen haben.",
];

$page_title = html($user->name()) . " · Nutzerverwaltung";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap" style="max-width:560px">
  <div class="crumbs"><a href="/users">Nutzerverwaltung</a><span class="sep">/</span><span><?php echo html($user->email()); ?></span></div>
  <h2 style="font-size:19px;margin-bottom:14px">User bearbeiten</h2>

  <?php if ($saved): ?><div class="alert alert-ok" role="status" style="margin-bottom:16px">Gespeichert.</div><?php endif; ?>
  <?php if ($error && isset($errText[$error])): ?><div class="alert" role="alert" style="margin-bottom:16px"><?php echo html($errText[$error]); ?></div><?php endif; ?>

  <div class="card" style="margin-bottom:16px">
    <h3 style="font-size:15px;margin-bottom:14px">Stammdaten</h3>
    <form method="post" action="/users/<?php echo $user->id(); ?>" class="stackform">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <input type="hidden" name="action" value="save">
      <div class="field"><label>E-Mail</label><input class="input" value="<?php echo htmlattr($user->email()); ?>" disabled><p class="note">Die E-Mail-Adresse ist die Anmeldung und kann nicht geändert werden.</p></div>
      <div class="field"><label>Name</label><input class="input" name="name" value="<?php echo htmlattr($user->name()); ?>" required></div>
      <div class="field"><label>Institution</label>
        <select class="input" name="institution_id">
          <option value="">— keine —</option>
          <?php foreach ($institutions as $inst): ?>
            <option value="<?php echo (int)$inst["id"]; ?>" <?php echo (int)$inst["id"] === $user->institutionId() ? "selected" : ""; ?>><?php echo html($inst["name"]); ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <label class="checkline"><input type="checkbox" name="is_admin" value="1" <?php echo $user->isAdmin() ? "checked" : ""; ?> <?php echo $is_self ? "disabled" : ""; ?>> Administrator</label>
      <label class="checkline"><input type="checkbox" name="active" value="1" <?php echo $user->isActive() ? "checked" : ""; ?> <?php echo $is_self ? "disabled" : ""; ?>> Aktiv (Login erlaubt)</label>
      <?php if ($is_self): ?><p class="note">Das eigene Konto kann nicht entmachtet oder gesperrt werden.</p><?php endif; ?>
      <button class="btn btn-primary" type="submit">Speichern</button>
    </form>
  </div>

  <div class="card">
    <h3 style="font-size:15px;margin-bottom:14px">Passwort zurücksetzen</h3>
    <form method="post" action="/users/<?php echo $user->id(); ?>" class="stackform" autocomplete="off">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <input type="hidden" name="action" value="resetpw">
      <div class="field"><label>Neues Passwort</label><input class="input" type="text" name="new" minlength="8" required placeholder="min. 8 Zeichen"></div>
      <button class="btn btn-primary" type="submit">Passwort setzen</button>
    </form>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
