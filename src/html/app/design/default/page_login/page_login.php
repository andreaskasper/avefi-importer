<?php
/*
 * Login-Seite. Erwartet: $error (string|null), $email (string).
 * POST-Verarbeitung passiert in Routing::login() → MyUser::attempt().
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$error = isset($error) ? $error : null;
$email = isset($email) ? $email : "";

$page_title = "Anmelden · AVefi Importer";
$body_class = "auth-page";
include __DIR__ . "/../layout/head.php";
?>
<main id="main" class="auth">
  <div class="login-card">
    <div class="login-wrap">

      <div class="login-hero">
        <div class="net"></div>
        <div class="k"><div class="logo" style="color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;gap:9px"><span class="dot"></span> AVefi&nbsp;Importer</div></div>
        <div class="k">
          <h2>Filme finden.<br>Daten verbinden.</h2>
          <p class="lead">Metadaten hochladen, automatisch ins AVefi-Schema überführen und veröffentlichen.</p>
        </div>
        <ul>
          <li>CSV · TSV · XML · EAD · MARC · JSON</li>
          <li>Automatische Format-Erkennung &amp; Mapping</li>
          <li>Validierung gegen das AVefi-Schema</li>
        </ul>
      </div>

      <form class="login-form" method="post" action="/login" autocomplete="on">
        <div>
          <span class="login-logo"><img src="/skins/av-efi-logo.svg" alt="AV-EFI" width="150" height="58"></span>
          <h3 style="font-size:19px;margin-top:14px">Anmelden</h3>
          <p class="dim small" style="margin:4px 0 6px">Bitte mit deinem Institutions-Konto anmelden.</p>
        </div>

        <?php if ($error !== null): ?>
          <div class="alert" role="alert"><?php echo html($error); ?></div>
        <?php endif; ?>

        <div class="field">
          <label for="email">E-Mail</label>
          <input class="input" type="email" id="email" name="email" placeholder="name@institution.de"
                 value="<?php echo htmlattr($email); ?>" required autofocus>
        </div>
        <div class="field">
          <label for="password">Passwort</label>
          <input class="input" type="password" id="password" name="password" placeholder="••••••••••" required>
        </div>

        <button class="btn btn-primary" type="submit" style="justify-content:center;padding:11px">Anmelden</button>

        <div class="divider">oder</div>
        <div class="sso" title="Noch nicht verfügbar"><span class="dot" style="box-shadow:none"></span> Institutioneller Login (eduGAIN / Shibboleth)</div>
        <p class="note">Passwort vergessen? · Kein Konto? Institution beantragen</p>
      </form>

    </div>
  </div>
</main>

<button class="ghost" id="themeBtn" title="Design wechseln" aria-label="Design wechseln"
        style="position:fixed;top:16px;right:16px">◐ Theme</button>

<?php include __DIR__ . "/../layout/foot.php"; ?>
