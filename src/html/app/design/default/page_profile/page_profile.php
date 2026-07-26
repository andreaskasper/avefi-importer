<?php
/*
 * Profil-Seite: Anzeigename und Passwort ändern.
 * Erwartet: $msg (Erfolg), $err (Fehler). POST-Handling in Routing::profile().
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$me   = MyUser::current();
$csrf = Csrf::token();
$msg  = isset($msg) ? $msg : null;
$err  = isset($err) ? $err : null;

$page_title = "Mein Profil · AVefi Importer";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap" style="max-width:560px">
  <div class="crumbs"><a href="/">Importe</a><span class="sep">/</span><span>Mein Profil</span></div>
  <h2 style="font-size:20px;margin-bottom:14px">Mein Profil</h2>

  <?php if ($msg !== null): ?><div class="alert alert-ok" style="margin-bottom:16px"><?php echo html($msg); ?></div><?php endif; ?>
  <?php if ($err !== null): ?><div class="alert" style="margin-bottom:16px"><?php echo html($err); ?></div><?php endif; ?>

  <div class="card" style="margin-bottom:16px">
    <h3 style="font-size:15px;margin-bottom:14px">Name</h3>
    <form method="post" action="/profile" class="stackform">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <input type="hidden" name="action" value="name">
      <div class="field">
        <label for="pf-name">Anzeigename</label>
        <input class="input" id="pf-name" name="name" value="<?php echo htmlattr($me->name()); ?>" required>
      </div>
      <div class="field">
        <label for="pf-email">E-Mail</label>
        <input class="input" id="pf-email" value="<?php echo htmlattr($me->email()); ?>" disabled>
        <p class="note">Die E-Mail-Adresse kann nur ein Administrator ändern.</p>
      </div>
      <button class="btn btn-primary" type="submit">Name speichern</button>
    </form>
  </div>

  <div class="card">
    <h3 style="font-size:15px;margin-bottom:14px">Passwort ändern</h3>
    <form method="post" action="/profile" class="stackform" autocomplete="off">
      <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">
      <input type="hidden" name="action" value="password">
      <div class="field">
        <label for="pf-cur">Aktuelles Passwort</label>
        <input class="input" id="pf-cur" type="password" name="current" required autocomplete="current-password">
      </div>
      <div class="field">
        <label for="pf-new">Neues Passwort</label>
        <input class="input" id="pf-new" type="password" name="new" minlength="8" required autocomplete="new-password">
      </div>
      <div class="field">
        <label for="pf-conf">Neues Passwort bestätigen</label>
        <input class="input" id="pf-conf" type="password" name="confirm" minlength="8" required autocomplete="new-password">
      </div>
      <button class="btn btn-primary" type="submit">Passwort ändern</button>
    </form>
  </div>
</main>
<?php include __DIR__ . "/../layout/foot.php"; ?>
