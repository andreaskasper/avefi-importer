<?php
/* App-Kopfzeile für angemeldete Seiten. Erwartet optional: $active (Nav-Key). */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$active = isset($active) ? $active : "";
$me   = MyUser::current();
$inst = $me ? $me->institutionName() : null;
?>
<header class="apphead">
  <a class="logo" href="/" aria-label="Zur Startseite">
    <span class="applogo"><img src="/skins/av-efi-logo.svg" alt="AV-EFI" height="26"></span>
  </a>
  <nav aria-label="Hauptnavigation">
    <a href="/" class="<?php echo $active === "imports" ? "on" : ""; ?>"<?php echo $active === "imports" ? ' aria-current="page"' : ""; ?>>Importe</a>
    <?php if ($me && $me->isAdmin()): $openReviews = FormatReview::countOpen(); ?>
      <a href="/reviews" class="<?php echo $active === "reviews" ? "on" : ""; ?>">Format-Review<?php if ($openReviews > 0): ?> <span class="badge b-wait" style="padding:1px 6px;margin-left:2px"><?php echo $openReviews; ?></span><?php endif; ?></a>
    <?php endif; ?>
  </nav>
  <div class="who">
    <?php if ($inst !== null): ?><span class="dim"><?php echo html($inst); ?></span><?php endif; ?>
    <button class="ghost" id="themeBtn" title="Design wechseln" aria-label="Design wechseln">◐</button>
    <?php if ($me): ?>
      <div class="usermenu">
        <button class="avatar-btn" id="userMenuBtn" type="button" aria-haspopup="true" aria-expanded="false"
                aria-label="Benutzermenü: <?php echo htmlattr($me->name()); ?>" title="<?php echo htmlattr($me->name()); ?>">
          <span class="avatar" aria-hidden="true"><?php echo html($me->initials()); ?></span>
        </button>
        <div class="menu" id="userMenu" role="menu" hidden>
          <div class="menu-head">
            <div class="fn"><?php echo html($me->name()); ?></div>
            <div class="dim small"><?php echo html($me->email()); ?></div>
          </div>
          <a class="menu-item" role="menuitem" href="/profile">Mein Profil</a>
          <?php if ($me->isAdmin()): ?><a class="menu-item" role="menuitem" href="/users">Nutzer verwalten</a><?php endif; ?>
          <a class="menu-item" role="menuitem" href="/logout">Abmelden</a>
        </div>
      </div>
    <?php endif; ?>
  </div>
</header>
