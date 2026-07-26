<?php
/*
 * Datensatz-Editor (Screen 4). Erwartet: $import, $record (row), $saved, $error.
 * Speichern via POST an /imports/<uuid>/records/<id>/save (Routing::recordSave).
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$csrf = Csrf::token();
$data = json_decode((string)($record["data_json"] ?? "{}"), true) ?: [];
$work    = $data["work"] ?? [];
$manifs  = $data["manifestations"] ?? [];
$items   = $data["items"] ?? [];
$contribs = $work["contributors"] ?? [];
$source  = $data["source"] ?? [];
$pct             = (int)$record["completeness"];
$schemaErrors    = SchemaValidator::validate($data);
$recommendations = array_values(array_filter(Completeness::issues($data), fn($i) => $i["level"] === "warn"));
$title   = trim((string)($record["work_title"] ?? "")) !== "" ? $record["work_title"] : "Ohne Titel";

$ev = fn($v) => htmlattr($v ?? "");

/* Wiederholbare Zeilen — dieselbe Funktion für vorhandene Zeilen und JS-Templates. */
function ed_contrib_row($i, array $c = []): string {
	$r = htmlattr($c["role"] ?? ""); $n = htmlattr($c["name"] ?? "");
	return '<div class="repeat-row"><div class="rr-fields">'
		. '<input class="input" name="contributors[' . $i . '][role]" placeholder="Rolle (z. B. director)" value="' . $r . '">'
		. '<input class="input" name="contributors[' . $i . '][name]" placeholder="Name" value="' . $n . '">'
		. '</div><button type="button" class="iconbtn-del" data-remove title="Entfernen">🗑</button></div>';
}
function ed_field($label, $name, $val): string {
	return '<label class="rr-field"><span>' . html($label) . '</span><input class="input" name="' . $name . '" value="' . htmlattr($val ?? "") . '"></label>';
}
function ed_manif_row($i, array $m = []): string {
	return '<div class="repeat-row rr-block"><div class="rr-grid">'
		. ed_field("Träger", "manifestations[" . $i . "][carrier]", $m["carrier"] ?? "")
		. ed_field("Datum", "manifestations[" . $i . "][date]", $m["date"] ?? "")
		. ed_field("Länge (min)", "manifestations[" . $i . "][duration_min]", $m["duration_min"] ?? "")
		. ed_field("Notiz", "manifestations[" . $i . "][note]", $m["note"] ?? "")
		. '</div><button type="button" class="iconbtn-del" data-remove title="Entfernen">🗑</button></div>';
}
function ed_item_row($i, array $it = []): string {
	return '<div class="repeat-row rr-block"><div class="rr-grid">'
		. ed_field("Haltende Institution", "items[" . $i . "][holding_institution]", $it["holding_institution"] ?? "")
		. ed_field("Signatur", "items[" . $i . "][signature]", $it["signature"] ?? "")
		. ed_field("Standort", "items[" . $i . "][location]", $it["location"] ?? "")
		. ed_field("Zustand", "items[" . $i . "][condition]", $it["condition"] ?? "")
		. '</div><button type="button" class="iconbtn-del" data-remove title="Entfernen">🗑</button></div>';
}

$page_title = html($title) . " · Editor";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main class="appwrap">
  <div class="crumbs">
    <a href="/">Importe</a><span class="sep">/</span>
    <a href="/imports/<?php echo htmlattr($import->id()); ?>/records"><?php echo html($import->filename()); ?></a>
    <span class="sep">/</span><a href="/imports/<?php echo htmlattr($import->id()); ?>/records">Datensätze</a>
    <span class="sep">/</span><span><?php echo html($title); ?></span>
  </div>

  <?php if ($saved): ?><div class="alert alert-ok" style="margin-bottom:14px">Gespeichert.</div><?php endif; ?>
  <?php if ($error === "csrf"): ?><div class="alert" style="margin-bottom:14px">Sitzung abgelaufen — bitte erneut speichern.</div><?php endif; ?>

  <form id="editorForm" method="post" action="/imports/<?php echo htmlattr($import->id()); ?>/records/<?php echo (int)$record["id"]; ?>/save">
    <input type="hidden" name="_csrf" value="<?php echo htmlattr($csrf); ?>">

    <div class="editbar">
      <h2 style="font-size:18px"><?php echo html($title); ?></h2>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button type="button" class="btn btn-outline btn-sm" id="jsonToggle">{ } JSON-Vorschau</button>
        <button type="submit" class="btn btn-primary btn-sm">✓ Speichern</button>
      </div>
    </div>

    <pre id="jsonPreview" class="jsonprev" hidden><?php echo html(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></pre>

    <div class="editor">
      <!-- structure nav -->
      <nav class="ed-nav">
        <div class="tier">Werk</div>
        <a href="#sec-work"><span class="tk" style="background:var(--work)"></span> Grunddaten</a>
        <a href="#sec-contrib"><span class="tk" style="background:var(--work)"></span> Beteiligte <span class="st dim">(<?php echo count($contribs); ?>)</span></a>
        <div class="tier">Manifestation (<?php echo count($manifs); ?>)</div>
        <a href="#sec-manif"><span class="tk" style="background:var(--manif)"></span> Manifestationen</a>
        <div class="tier">Exemplar (<?php echo count($items); ?>)</div>
        <a href="#sec-items"><span class="tk" style="background:var(--item)"></span> Exemplare</a>
      </nav>

      <!-- form -->
      <div class="ed-main">
        <section id="sec-work">
          <div class="sechead"><span class="tk" style="background:var(--work)"></span><h3>Werk · Grunddaten</h3></div>
          <div class="frow"><label>Haupttitel <span class="req">*</span></label><div class="fval"><input class="input" name="work[title]" value="<?php echo $ev($work["title"] ?? ""); ?>"></div></div>
          <div class="frow"><label>Weitere Titel</label><div class="fval"><input class="input" name="work[titles_additional]" value="<?php echo $ev(implode("; ", $work["titles_additional"] ?? [])); ?>" placeholder="mit ; getrennt"></div></div>
          <div class="frow"><label>Produktionsjahr <span class="req">*</span></label><div class="fval"><input class="input" name="work[year]" value="<?php echo $ev($work["year"] ?? ""); ?>" style="max-width:140px"></div></div>
          <div class="frow"><label>Herstellungsland</label><div class="fval"><input class="input" name="work[country]" value="<?php echo $ev($work["country"] ?? ""); ?>"></div></div>
          <div class="frow"><label>Werkart <span class="req">*</span></label><div class="fval"><input class="input" name="work[work_type]" list="worktypes" value="<?php echo $ev($work["work_type"] ?? ""); ?>"></div></div>
          <div class="frow"><label>Genre</label><div class="fval"><input class="input" name="work[genre]" value="<?php echo $ev($work["genre"] ?? ""); ?>"></div></div>
          <div class="frow"><label>Sprache(n)</label><div class="fval"><input class="input" name="work[language]" value="<?php echo $ev($work["language"] ?? ""); ?>"></div></div>
          <div class="frow" style="border-bottom:0"><label>Beschreibung</label><div class="fval"><textarea class="input" name="work[description]" rows="3"><?php echo html($work["description"] ?? ""); ?></textarea></div></div>
          <datalist id="worktypes">
            <option>Spielfilm</option><option>Dokumentarfilm</option><option>Kurzfilm</option>
            <option>Animationsfilm</option><option>Experimentalfilm</option><option>Serie</option><option>unbestimmt</option>
          </datalist>
        </section>

        <section id="sec-contrib">
          <div class="sechead"><span class="tk" style="background:var(--work)"></span><h3>Beteiligte</h3></div>
          <div id="contribList" class="repeat-list">
            <?php foreach ($contribs as $i => $c) echo ed_contrib_row($i, is_array($c) ? $c : []); ?>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-add="contributor">+ Beteiligte:r</button>
        </section>

        <section id="sec-manif">
          <div class="sechead"><span class="tk" style="background:var(--manif)"></span><h3>Manifestationen</h3></div>
          <div id="manifList" class="repeat-list">
            <?php foreach ($manifs as $i => $m) echo ed_manif_row($i, is_array($m) ? $m : []); ?>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-add="manifestation">+ Manifestation</button>
        </section>

        <section id="sec-items">
          <div class="sechead"><span class="tk" style="background:var(--item)"></span><h3>Exemplare</h3></div>
          <div id="itemList" class="repeat-list">
            <?php foreach ($items as $i => $it) echo ed_item_row($i, is_array($it) ? $it : []); ?>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-add="item">+ Exemplar</button>
        </section>
      </div>

      <!-- side -->
      <aside class="ed-side">
        <div style="text-align:center">
          <div class="bigring <?php echo Completeness::ringClass($pct); ?>" style="--p:<?php echo $pct; ?>"><span><b class="tnum"><?php echo $pct; ?>%</b><small>vollständig</small></span></div>
          <p class="note" style="margin-top:0">Wird beim Speichern neu berechnet.</p>
        </div>
        <div>
          <h4 class="side-h">Schema-Prüfung</h4>
          <?php if (empty($schemaErrors)): ?>
            <div class="val-list"><div class="vi"><span class="m badge b-ok" style="padding:1px 6px">✓</span><span>Record ist schema-gültig</span></div></div>
          <?php else: ?>
            <div class="val-list">
              <?php foreach ($schemaErrors as $e): ?>
                <div class="vi"><span class="m badge b-danger" style="padding:1px 6px">×</span><span><?php echo html($e); ?></span></div>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
          <?php if ($recommendations): ?>
            <h4 class="side-h" style="margin-top:14px">Empfehlungen</h4>
            <div class="val-list">
              <?php foreach ($recommendations as $r): ?>
                <div class="vi"><span class="m badge b-warn" style="padding:1px 6px">!</span><span><?php echo html($r["text"]); ?></span></div>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
        </div>
        <div>
          <h4 class="side-h">Herkunft</h4>
          <p class="small dim" style="margin:0">
            Quelle: <b><?php echo html($source["file"] ?? $import->filename()); ?></b>
            <?php if (isset($source["row"])): ?> · Zeile <?php echo (int)$source["row"]; ?><?php endif; ?>
            <?php if ($import->profileLabel()): ?> · Mapping <?php echo html($import->profileLabel()); ?><?php endif; ?>
          </p>
        </div>
        <button type="button" class="btn btn-outline" id="pidRegisterBtn" style="justify-content:center">🔗 PID registrieren</button>
        <button type="submit" class="btn btn-primary" style="justify-content:center">✓ Speichern</button>
      </aside>
    </div>
  </form>
</main>

<template id="tpl-contributor"><?php echo ed_contrib_row("__i__"); ?></template>
<template id="tpl-manifestation"><?php echo ed_manif_row("__i__"); ?></template>
<template id="tpl-item"><?php echo ed_item_row("__i__"); ?></template>

<script src="/skins/editor.js"></script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
