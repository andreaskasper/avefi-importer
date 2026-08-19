<?php
/*
 * Mapping-Editor: Spaltenzuordnung für eine tabellarische Quelle.
 * Erwartet: $import, $boot, $profile, $columnCount.
 */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }

$page_title = html($subject) . " · Zuordnung";
include __DIR__ . "/../layout/head.php";
include __DIR__ . "/../layout/appheader.php";
?>
<main id="main" class="appwrap wide">
  <div class="crumbs">
    <a href="<?php echo htmlattr($backUrl); ?>"><?php echo html($backLabel); ?></a>
    <span class="sep">/</span><span><?php echo html($subject); ?></span>
    <span class="sep">/</span><span>Zuordnung</span>
  </div>

  <script type="application/json" id="mappingBoot"><?php
    echo json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
  ?></script>

  <noscript><div class="alert" role="alert">Der Zuordnungs-Editor braucht JavaScript.</div></noscript>

  <div id="mappingApp">
    <div class="dim small" style="padding:24px">Zuordnungs-Editor wird geladen …</div>
  </div>

  <!-- Das Wurzel-Template liegt AUSSERHALB des Mount-Elements und wird per
       template:-Option übergeben. Innerhalb von #mappingApp würde Vue die
       In-DOM-Übersetzung nutzen und dabei den Inhalt des <template> verlieren. -->
  <template id="mappingTpl">
      <div class="map-head">
        <div>
          <h2><?php echo html($subject); ?></h2>
          <div class="dim small">
            <?php echo (int)$columnCount; ?> Spalten · {{ mappedCount }} zugeordnet ·
            {{ ignoredCount }} ignoriert ·
            <span :class="openColumns.length ? 'warnhint' : ''">{{ openColumns.length }} offen</span>
          </div>
        </div>
        <label class="map-name">
          <span class="dim small">Name des Profils</span>
          <input class="input" v-model="name" aria-label="Name des Mapping-Profils">
        </label>
        <div class="map-actions">
          <span class="dim small" v-if="busy"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> rechnet …</span>
          <button type="button" :class="canStart ? 'btn btn-outline' : 'btn btn-primary'"
                  @click="save(false)" :disabled="saving">Speichern</button>
          <button v-if="canStart" type="button" class="btn btn-primary" @click="save(true)"
                  :disabled="saving || blockers.length">Speichern &amp; konvertieren</button>
        </div>
      </div>

      <div class="alert alert-ok" role="status" v-if="message">{{ message }}</div>
      <div class="alert" role="alert" v-if="error">{{ error }}</div>
      <div class="alert alert-ok" role="status" v-if="adoptNote">{{ adoptNote }}</div>

      <div class="alert" role="status" v-if="foreign.length && !mappedCount">
        Für diese Kopfzeile gibt es bereits {{ foreign.length === 1 ? 'ein Profil' : foreign.length + ' Profile' }}:
        <span v-for="(p,i) in foreign" :key="p.id">
          <button type="button" class="linkbtn" @click="adopt(p)">{{ p.name }} ({{ p.institution_name }})</button><span v-if="i < foreign.length-1">, </span>
        </span>
      </div>

      <div class="alert" role="alert" v-if="blockers.length">
        <b>Das lässt sich so nicht verarbeiten:</b>
        <ul class="tight"><li v-for="(c,i) in blockers" :key="i">
          <span v-if="c.column">Spalte „{{ c.column }}“: </span>{{ c.message }}
          <button v-if="c.fix" type="button" class="linkbtn" @click="applyFix(c)">beheben</button>
        </li></ul>
      </div>

      <div class="map-grid">
        <!-- Arbeitsfläche: eine Zeile je Quellspalte -->
        <div>
          <div class="tablewrap">
            <table class="maptable">
              <caption class="sr-only">Zuordnung der Quellspalten auf das AVefi-Schema</caption>
              <thead><tr>
                <th scope="col">Quellspalte</th>
                <th scope="col">Beispielwerte</th>
                <th scope="col">Ziel</th>
                <th scope="col">Ergebnis</th>
                <th scope="col"><span class="sr-only">Aktionen</span></th>
              </tr></thead>
              <tbody>
                <template v-for="col in columns" :key="col">
                  <tr :class="{'row-open': !mapping.columns[col] || (!mapping.columns[col].ignore && !(mapping.columns[col].targets||[]).length),
                               'row-ignored': mapping.columns[col] && mapping.columns[col].ignore}">
                    <td>
                      <div class="fn">{{ col }}</div>
                      <div class="dim small" v-if="mapping.columns[col] && mapping.columns[col].ignore">ignoriert</div>
                    </td>
                    <td class="dim small">
                      <div v-for="v in sampleOf(col)" :key="v" class="samplev">{{ v }}</div>
                      <span v-if="!sampleOf(col).length">–</span>
                    </td>
                    <td>
                      <div v-if="branchCount(col)" class="tchips">
                        <button type="button" class="chip" v-for="(t,i) in spec(col).targets" :key="i"
                                @click="open[col]=true" :title="targetLabel(t.target)">
                          <span v-if="targets[t.target]">{{ targets[t.target].levelLabel }} › {{ targets[t.target].label }}</span>
                          <span v-else class="warnhint">Ziel fehlt</span>
                        </button>
                        <span class="dim small" v-if="branchCount(col) > 1">{{ branchCount(col) }} Zweige</span>
                      </div>
                      <div class="tsugg" v-if="!(spec(col).targets||[]).length && !spec(col).ignore">
                        <button type="button" class="chip chip-sugg" v-for="s in (suggestions[col]||[])" :key="s.target"
                                @click="acceptSuggestion(col, s.target)"
                                :title="'Vorschlag (' + s.score + ' %) — ' + targetLabel(s.target)">
                          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> {{ targets[s.target] ? targets[s.target].label : s.target }}</button>
                        <button type="button" class="chip chip-sugg" v-for="h in (hints[col]||[])" :key="'h'+h.target"
                                @click="acceptSuggestion(col, h.target)"
                                :title="'Von ' + h.count + ' anderen Profilen so gemappt'">
                          <i class="fa-solid fa-people-group" aria-hidden="true"></i> {{ targets[h.target] ? targets[h.target].label : h.target }}</button>
                        <button type="button" class="btn btn-outline btn-sm" @click="addTarget(col,'')">Ziel wählen</button>
                      </div>
                    </td>
                    <td class="mapresult">
                      <template v-if="resultOf(col)">
                        <div v-for="(o,i) in resultOf(col).outputs" :key="i" class="okval">
                          <i class="fa-solid fa-check" aria-hidden="true"></i> {{ o.value }}</div>
                        <div v-for="(e,i) in resultOf(col).errors" :key="'e'+i" class="errval">
                          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ e }}</div>
                        <span class="dim" v-if="!resultOf(col).outputs.length && !resultOf(col).errors.length">–</span>
                      </template>
                      <span class="dim" v-else>–</span>
                    </td>
                    <td class="maprowbtns">
                      <button type="button" class="iconbtn-menu" @click="toggleOpen(col)"
                              :aria-expanded="open[col] ? 'true' : 'false'" :aria-label="'Kette für ' + col + ' bearbeiten'"
                              title="Konverter-Kette">
                        <i class="fa-solid" :class="open[col] ? 'fa-chevron-up' : 'fa-sliders'" aria-hidden="true"></i></button>
                      <button type="button" class="iconbtn-menu" @click="toggleIgnore(col)"
                              :aria-pressed="spec(col).ignore ? 'true' : 'false'" :aria-label="'Spalte ' + col + ' ignorieren'"
                              title="Spalte ignorieren">
                        <i class="fa-solid fa-ban" aria-hidden="true"></i></button>
                    </td>
                  </tr>
                  <tr v-if="open[col]" :key="col + '-chain'" class="chainrow">
                    <td colspan="5">
                      <!-- Verzweigung: Spalte → globale Kette → je Zweig eigene Kette und Ziel -->
                      <div class="branch">
                        <div class="branch-src">
                          <span class="branch-col"><i class="fa-solid fa-table-columns" aria-hidden="true"></i> {{ col }}</span>
                          <span class="dim small" v-if="sampleOf(col).length">z. B. „{{ sampleOf(col)[0] }}“</span>
                        </div>

                        <div class="branch-global">
                          <chain-editor :chain="spec(col).pre" :columns="columns"
                                        label="Konverter für alle Ziele dieser Spalte" @change="refresh()"></chain-editor>
                        </div>

                        <div class="branch-list">
                          <div class="branch-item" v-for="(t,i) in spec(col).targets" :key="i">
                            <div class="branch-connector" aria-hidden="true"></div>
                            <div class="branch-body">
                              <div class="branch-head">
                                <span class="branch-no">Zweig {{ i + 1 }}</span>
                                <button type="button" class="iconbtn-del" @click="removeTarget(col,i)"
                                        :aria-label="'Zweig ' + (i+1) + ' von ' + col + ' entfernen'">
                                  <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                              </div>

                              <chain-editor :chain="t.post" :columns="columns"
                                            label="Weitere Konverter nur für dieses Ziel" @change="refresh()"></chain-editor>

                              <label class="branch-target">
                                <span class="step-plabel">Ziel im AVefi-Schema</span>
                                <select class="input" v-model="t.target" @change="refresh()"
                                        :aria-label="'Ziel von Zweig ' + (i+1) + ' für ' + col">
                                  <option value="">– Ziel wählen –</option>
                                  <optgroup v-for="g in targetGroups" :key="g.label" :label="g.label">
                                    <option v-for="tt in g.items" :key="tt.key" :value="tt.key">{{ tt.label }}</option>
                                  </optgroup>
                                </select>
                              </label>

                              <div class="branch-result" v-if="resultFor(col, t.target)">
                                <div v-for="(o,j) in resultFor(col, t.target).outputs" :key="j" class="okval">
                                  <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i> {{ o.value }}</div>
                                <div class="dim small" v-if="!resultFor(col, t.target).outputs.length">
                                  ergibt für die erste Zeile keinen Wert</div>
                              </div>

                              <div class="vocabhint" v-if="enumFor(col,i)">
                                <span class="dim small">Zulässige Werte: {{ enumFor(col,i).join(', ') }}</span>
                                <button type="button" class="btn btn-outline btn-sm" @click="prefillVocabulary(col,i)">
                                  Werteliste aus der Datei vorbefüllen</button>
                              </div>
                            </div>
                          </div>

                          <div class="branch-item branch-add-item">
                            <div class="branch-connector" aria-hidden="true"></div>
                            <button type="button" class="btn btn-outline btn-sm" @click="addTarget(col,'')">
                              <i class="fa-solid fa-plus" aria-hidden="true"></i> weiteres Ziel für diese Spalte</button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div class="card" style="margin-top:14px" v-if="warnings.length">
            <h4 class="side-h">Hinweise</h4>
            <ul class="tight">
              <li v-for="(c,i) in warnings" :key="i">
                <span v-if="c.column">Spalte „{{ c.column }}“: </span>{{ c.message }}
                <button v-if="c.fix" type="button" class="linkbtn" @click="applyFix(c)">automatisch beheben</button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Ergebnis: die AVefi-Struktur, die entsteht -->
        <aside class="mapside">
          <div class="card">
            <h4 class="side-h">Ergebnis je Datensatz</h4>
            <div v-for="lvl in ['work','manifestation','item']" :key="lvl" class="treelvl">
              <div class="treelvl-h">
                <span class="lvlbadge" :class="'lvl-'+lvl"></span>
                {{ lvl === 'work' ? 'Werk' : (lvl === 'manifestation' ? 'Fassung' : 'Exemplar') }}
              </div>
              <ul class="treelist" v-if="tree[lvl].length">
                <li v-for="n in tree[lvl]" :key="n.key">
                  <span class="tl-label">{{ n.label }}</span>
                  <span class="dim small tl-from">
                    <template v-for="(f,i) in n.from" :key="i">
                      <span v-if="f.source==='default'">Festwert</span><span v-else>{{ f.column }}</span><span v-if="i<n.from.length-1">, </span>
                    </template>
                  </span>
                </li>
              </ul>
              <div class="dim small" v-else>– nichts zugeordnet –</div>
            </div>
            <div class="alert" role="status" v-if="schemaIssues.length" style="margin-top:10px">
              <b>Schema-Beanstandungen im ersten Datensatz:</b>
              <ul class="tight"><li v-for="(s,i) in schemaIssues" :key="i">{{ s }}</li></ul>
            </div>
          </div>

          <div class="card">
            <h4 class="side-h">Festwerte</h4>
            <p class="note">Füllt Felder, die die Datei nicht liefert — etwa die ISIL der eigenen Einrichtung.</p>
            <div v-for="(d,i) in (mapping.defaults||[])" :key="i" class="defrow">
              <select class="input" v-model="d.target" @change="refresh()" aria-label="Ziel des Festwerts">
                <option value="">– Ziel –</option>
                <optgroup v-for="g in targetGroups" :key="g.label" :label="g.label">
                  <option v-for="tt in g.items" :key="tt.key" :value="tt.key">{{ tt.label }}</option>
                </optgroup>
              </select>
              <input class="input" v-model="d.value" @change="refresh()" placeholder="Wert" aria-label="Wert">
              <button type="button" class="iconbtn-del" @click="removeDefault(i)" aria-label="Festwert entfernen">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="addDefault()">+ Festwert</button>
          </div>

          <div class="card">
            <h4 class="side-h">Werkbildung</h4>
            <p class="note">
              Standardmäßig wird jede Zeile ein eigenes Werk. Wähle Merkmale, über die Zeilen zu
              einem gemeinsamen Werk zusammengefasst werden. Die verwendete Regel steht später im Prüfbericht.
            </p>
            <label class="checkline" v-for="c in groupingCandidates()" :key="c.key">
              <input type="checkbox" :checked="groupingBy.indexOf(c.key)>=0" @change="toggleGrouping(c.key)"> {{ c.label }}
            </label>
            <p class="note" v-if="groupingBy.length">
              Zeilen mit gleichem Wert in allen gewählten Merkmalen teilen sich ein Werk.
            </p>
          </div>
        </aside>
      </div>
  </template>
</main>
<script src="<?php echo html(asset('/skins/mapping-editor.js')); ?>"></script>
<?php include __DIR__ . "/../layout/foot.php"; ?>
