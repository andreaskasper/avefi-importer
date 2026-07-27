<?php
/*
 * Datensatz-Editor (AVefi-Schema, Vue3). Erwartet: $import, $record, $canonical, $config.
 * Der eigentliche Editor ist eine Vue-App (skins/editor-avefi.js); Daten werden als
 * JSON eingebettet und per JSON an .../save gepostet.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$csrf  = Csrf::token();
$disp  = AvefiMapper::workDisplay($canonical["work"] ?? []);
$title = trim((string)($disp["title"] ?? "")) !== "" ? $disp["title"] : "Ohne Titel";
$pct   = Completeness::forAvefi($canonical);

$boot = [
	"record"       => $canonical,
	"config"       => $config,
	"csrf"         => $csrf,
	"saveUrl"      => "/imports/" . $import->id() . "/records/" . (int)$record["id"] . "/save",
	"lookupUrl"    => "/lookup",
	"recordsUrl"   => "/imports/" . $import->id() . "/records",
	"filename"     => $import->filename(),
	"completeness" => $pct,
];
$jsonFlags = JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

$page_title = html($title) . " · Editor";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap">
  <div class="crumbs">
    <a href="/">Importe</a><span class="sep">/</span>
    <a href="/imports/<?php echo htmlattr($import->id()); ?>/records"><?php echo html($import->filename()); ?></a>
    <span class="sep">/</span><a href="/imports/<?php echo htmlattr($import->id()); ?>/records">Datensätze</a>
    <span class="sep">/</span><span><?php echo html($title); ?></span>
  </div>

  <noscript><div class="alert" role="alert" style="margin:12px 0">Der Editor benötigt JavaScript.</div></noscript>

  <div id="editorApp" data-boot="<?php echo htmlattr(''); ?>">
    <div class="dim small" style="padding:24px">Editor wird geladen …</div>
  </div>

  <script id="editorBoot" type="application/json"><?php echo json_encode($boot, $jsonFlags); ?></script>

  <template id="editorTpl">
    <div>
      <div class="editbar">
        <h2 class="ed-title">{{ titleText }}</h2>
        <div class="bigring ed-ring" :class="completeness<50?'low':(completeness<80?'mid':'')" :style="{'--p':completeness}" role="img" :aria-label="'Vollständigkeit '+completeness+' Prozent'"><span aria-hidden="true"><b class="tnum">{{ completeness }}%</b></span></div>
        <div class="ed-actions">
          <button type="button" class="btn btn-outline btn-sm" @click="showJson=!showJson" :aria-expanded="showJson?'true':'false'"><span aria-hidden="true">{ }</span> JSON</button>
          <button type="button" class="btn btn-outline btn-sm" @click="pid"><span aria-hidden="true">🔗</span> PID</button>
          <button type="button" class="btn btn-primary btn-sm" @click="save" :disabled="saving">
            <span v-if="saving"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Speichern…</span>
            <span v-else><span aria-hidden="true">✓</span> Speichern</span>
          </button>
        </div>
      </div>

      <div v-if="savedAt" class="alert alert-ok" role="status" style="margin:0 0 12px">Gespeichert.</div>
      <div v-if="errors.length" class="alert" role="alert" style="margin:0 0 12px">
        <b>{{ errors.length }} Schema-Hinweis(e)</b> — Speichern bleibt möglich:
        <ul class="ed-errs"><li v-for="(e,i) in errors" :key="i">{{ e }}</li></ul>
      </div>

      <pre v-if="showJson" class="jsonprev" aria-label="AVefi-JSON-Vorschau">{{ jsonText }}</pre>

      <div class="ed-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab==='work'" :class="{on:tab==='work'}" @click="tab='work'">Werk</button>
        <button type="button" role="tab" :aria-selected="tab==='manifestations'" :class="{on:tab==='manifestations'}" @click="tab='manifestations'">Manifestationen ({{ m.manifestations.length }})</button>
        <button type="button" role="tab" :aria-selected="tab==='items'" :class="{on:tab==='items'}" @click="tab='items'">Exemplare ({{ m.items.length }})</button>
      </div>

      <!-- WERK -->
      <section v-show="tab==='work'" class="ed-tabpanel">
        <div class="ed-card">
          <h3>Grunddaten</h3>
          <div class="ed-grid2">
            <label class="ed-f"><span>Werkart *</span><enum-select v-model="m.work.type" enum-name="WorkVariantTypeEnum"></enum-select></label>
            <label class="ed-f"><span>Variante</span><enum-select v-model="m.work.variant_type" enum-name="VariantTypeEnum"></enum-select></label>
            <label class="ed-f"><span>Produktionsjahr</span><input class="input" v-model="m.work.productionYear" placeholder="z. B. 1966 oder 1966-05-21~"></label>
          </div>
        </div>

        <div class="ed-card">
          <h3>Titel</h3>
          <div class="ed-title-row">
            <input class="input" v-model="m.work.primaryTitle.has_name" placeholder="Haupttitel *" aria-label="Haupttitel">
            <enum-select v-model="m.work.primaryTitle.type" enum-name="TitleTypeEnum"></enum-select>
            <span class="ed-primary-badge" title="Bevorzugter Titel">primär</span>
          </div>
          <div class="ed-title-row" v-for="(t,i) in m.work.altTitles" :key="i">
            <input class="input" v-model="t.has_name" placeholder="Weiterer Titel" aria-label="Weiterer Titel">
            <enum-select v-model="t.type" enum-name="TitleTypeEnum"></enum-select>
            <button type="button" class="iconbtn-del" @click="rm(m.work.altTitles,i)" aria-label="Titel entfernen"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addAlt">+ Titel</button>
        </div>

        <div class="ed-card">
          <div class="ed-card-head">
            <h3>Schlagwörter · Personen · Orte</h3>
            <button type="button" class="btn btn-outline btn-sm" @click="matchAll" :disabled="matchingAll" title="Begriffe ohne ID automatisch gegen GND/Wikidata/VIAF abgleichen">
              <span v-if="matchingAll"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> gleicht ab …</span>
              <span v-else>Automatisch abgleichen</span>
            </button>
          </div>
          <p class="note">Tippen und einen Treffer wählen — oder die ID wird bei eindeutigem Treffer automatisch vorgeschlagen (GND/Wikidata/VIAF) und als <code>same_as</code> angehängt.</p>
          <entity-row v-for="(s,i) in m.work.subjects" :key="i" :entity="s" @remove="rm(m.work.subjects,i)"></entity-row>
          <button type="button" class="btn btn-outline btn-sm" @click="addSubject">+ Eintrag</button>
        </div>

        <div class="ed-card">
          <h3>Beteiligte</h3>
          <p class="note">Tätigkeit + Person; die Person kann direkt mit GND/Wikidata/VIAF verknüpft werden.</p>
          <activity-row v-for="(a,i) in m.work.activities" :key="i" :act="a" @remove="rm(m.work.activities,i)"></activity-row>
          <button type="button" class="btn btn-outline btn-sm" @click="addActivity">+ Beteiligte:r</button>
        </div>

        <div class="ed-card">
          <h3>Weitere Ereignisse</h3>
          <div class="ed-title-row" v-for="(e,i) in m.work.events" :key="i">
            <select class="input" v-model="e.category" aria-label="Ereignisart"><option v-for="c in (config.eventCategories||[])" :key="c.category" :value="c.category">{{ c.label }}</option></select>
            <input class="input" v-model="e.has_date" placeholder="Datum (EDTF)" aria-label="Ereignisdatum">
            <button type="button" class="iconbtn-del" @click="rm(m.work.events,i)" aria-label="Ereignis entfernen"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addEvent">+ Ereignis</button>
        </div>

        <div class="ed-card">
          <h3>Genre &amp; Form</h3>
          <div class="ed-title-row" v-for="(g,i) in m.work.genres" :key="i">
            <input class="input" v-model="g.has_name" placeholder="Genre" aria-label="Genre">
            <button type="button" class="iconbtn-del" @click="rm(m.work.genres,i)" aria-label="Genre entfernen"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addGenre">+ Genre</button>
          <div class="ed-forms">
            <div class="ed-title-row" v-for="(f,i) in m.work.forms" :key="'f'+i">
              <enum-select v-model="m.work.forms[i]" enum-name="WorkFormEnum" placeholder="Form"></enum-select>
              <button type="button" class="iconbtn-del" @click="rm(m.work.forms,i)" aria-label="Form entfernen"><span aria-hidden="true">🗑</span></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="m.work.forms.push('')">+ Form</button>
          </div>
        </div>

        <div class="ed-card">
          <h3>Identifier &amp; Notizen</h3>
          <div class="ed-title-row" v-for="(r,i) in m.work.identifiers" :key="i">
            <select class="input" v-model="r.resourceType" aria-label="Identifier-Typ"><option value="LocalResource">Lokal</option><option value="AVefiResource">AVefi-PID</option></select>
            <input class="input" v-model="r.id" placeholder="ID" aria-label="Identifier">
            <button type="button" class="iconbtn-del" @click="rm(m.work.identifiers,i)" aria-label="Identifier entfernen"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(m.work.identifiers)">+ Identifier</button>
          <div class="ed-title-row" v-for="(n,i) in m.work.notes" :key="'n'+i">
            <input class="input" v-model="m.work.notes[i]" placeholder="Notiz" aria-label="Notiz">
            <button type="button" class="iconbtn-del" @click="rm(m.work.notes,i)" aria-label="Notiz entfernen"><span aria-hidden="true">🗑</span></button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addNote(m.work.notes)">+ Notiz</button>
        </div>
      </section>

      <!-- MANIFESTATIONEN -->
      <section v-show="tab==='manifestations'" class="ed-tabpanel">
        <div class="ed-card" v-for="(mf,i) in m.manifestations" :key="i">
          <div class="ed-card-head"><h3>Manifestation {{ i+1 }}</h3><button type="button" class="iconbtn-del" @click="rm(m.manifestations,i)" aria-label="Manifestation entfernen"><span aria-hidden="true">🗑</span></button></div>
          <div class="ed-title-row"><input class="input" v-model="mf.primaryTitle.has_name" placeholder="Titel" aria-label="Manifestations-Titel"><enum-select v-model="mf.primaryTitle.type" enum-name="TitleTypeEnum"></enum-select></div>
          <div class="ed-title-row" v-for="(r,j) in mf.identifiers" :key="j"><select class="input" v-model="r.resourceType" aria-label="Identifier-Typ"><option value="LocalResource">Lokal</option><option value="AVefiResource">AVefi-PID</option></select><input class="input" v-model="r.id" placeholder="ID" aria-label="Identifier"><button type="button" class="iconbtn-del" @click="rm(mf.identifiers,j)" aria-label="Identifier entfernen"><span aria-hidden="true">🗑</span></button></div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(mf.identifiers)">+ Identifier</button>
        </div>
        <button type="button" class="btn btn-outline" @click="addManifestation">+ Manifestation</button>
      </section>

      <!-- EXEMPLARE -->
      <section v-show="tab==='items'" class="ed-tabpanel">
        <div class="ed-card" v-for="(it,i) in m.items" :key="i">
          <div class="ed-card-head"><h3>Exemplar {{ i+1 }}</h3><button type="button" class="iconbtn-del" @click="rm(m.items,i)" aria-label="Exemplar entfernen"><span aria-hidden="true">🗑</span></button></div>
          <div class="ed-title-row"><input class="input" v-model="it.primaryTitle.has_name" placeholder="Titel" aria-label="Exemplar-Titel"><enum-select v-model="it.primaryTitle.type" enum-name="TitleTypeEnum"></enum-select></div>
          <div class="ed-grid2">
            <label class="ed-f"><span>Elementtyp</span><enum-select v-model="it.element_type" enum-name="ItemElementTypeEnum"></enum-select></label>
            <label class="ed-f"><span>Farbe</span><enum-select v-model="it.has_colour_type" enum-name="ColourTypeEnum"></enum-select></label>
            <label class="ed-f"><span>Ton</span><enum-select v-model="it.has_sound_type" enum-name="SoundTypeEnum"></enum-select></label>
            <label class="ed-f"><span>Bildrate</span><enum-select v-model="it.has_frame_rate" enum-name="FrameRateEnum"></enum-select></label>
            <label class="ed-f"><span>Zugang</span><enum-select v-model="it.has_access_status" enum-name="ItemAccessStatusEnum"></enum-select></label>
            <label class="ed-f"><span>Dauer (ISO 8601)</span><input class="input" v-model="it.duration" placeholder="PT01H30M00S"></label>
          </div>
          <div class="ed-sub">
            <span class="ed-sublabel">Sprachen</span>
            <div class="ed-title-row" v-for="(l,j) in it.languages" :key="j"><enum-select v-model="l.code" enum-name="LanguageCodeEnum" placeholder="Sprache"></enum-select><enum-select v-model="l.usage" enum-name="LanguageUsageEnum" placeholder="Verwendung"></enum-select><button type="button" class="iconbtn-del" @click="rm(it.languages,j)" aria-label="Sprache entfernen"><span aria-hidden="true">🗑</span></button></div>
            <button type="button" class="btn btn-outline btn-sm" @click="it.languages.push({code:'',usage:''})">+ Sprache</button>
          </div>
          <div class="ed-title-row" v-for="(r,j) in it.identifiers" :key="'id'+j"><select class="input" v-model="r.resourceType" aria-label="Identifier-Typ"><option value="LocalResource">Lokal</option><option value="AVefiResource">AVefi-PID</option></select><input class="input" v-model="r.id" placeholder="ID" aria-label="Identifier"><button type="button" class="iconbtn-del" @click="rm(it.identifiers,j)" aria-label="Identifier entfernen"><span aria-hidden="true">🗑</span></button></div>
          <button type="button" class="btn btn-outline btn-sm" @click="addIdentifier(it.identifiers)">+ Identifier</button>
        </div>
        <button type="button" class="btn btn-outline" @click="addItem">+ Exemplar</button>
      </section>
    </div>
  </template>
</main>
<script src="<?php echo html(asset('/skins/editor-avefi.js')); ?>"></script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
