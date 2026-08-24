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
          <button type="button" class="btn btn-outline btn-sm" @click="toggleMerged()"
                  :aria-pressed="merged ? 'true' : 'false'"
                  :title="merged ? 'Beispiel und Ergebnis getrennt anzeigen' : 'Beispiel und Ergebnis zusammen anzeigen'">
            <i class="fa-solid" :class="merged ? 'fa-table-columns' : 'fa-right-long'" aria-hidden="true"></i>
            {{ merged ? 'Getrennt' : 'Zusammen' }}</button>
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

      <div class="checkbar" v-if="allChecks.length">
        <div class="checkbar-h">
          <span v-if="blockers.length" class="badge b-danger"><span class="bd"></span>{{ blockers.length }} blockierend</span>
          <span v-if="warnings.length" class="badge b-wait"><span class="bd"></span>{{ warnings.length }} Hinweis{{ warnings.length === 1 ? '' : 'e' }}</span>
        </div>
        <ul class="checklist">
          <li v-for="(c,i) in allChecks" :key="i" :class="c.level === 'nogo' ? 'chk-nogo' : 'chk-warn'">
            <i class="fa-solid" :class="c.level === 'nogo' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'" aria-hidden="true"></i>
            <button v-if="c.column" type="button" class="linkbtn chk-col" @click="gotoColumn(c.column)">{{ c.column }}</button>
            <span class="chk-msg">{{ c.message }}</span>
            <button v-if="c.fix" type="button" class="btn btn-outline btn-sm" @click="applyFix(c)">Automatisch beheben</button>
          </li>
        </ul>
      </div>

      <div class="modal-overlay" v-if="authOpen" @click.self="closeAuth()">
        <div class="modal-box" role="dialog" aria-modal="true" aria-label="Normdaten zuordnen" style="max-width:720px">
          <div class="modal-head">
            <h3>„{{ authOpen.value }}“ zuordnen</h3>
            <button type="button" class="modal-x" @click="closeAuth()" aria-label="Schließen">×</button>
          </div>
          <div class="modal-body">
            <div v-if="authBusy" class="dim"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> sucht in {{ authOpen.source.toUpperCase() }} …</div>
            <template v-else>
              <p class="note" v-if="!authCands.length" style="margin:0">
                Keine Treffer. Du kannst den Wert bewusst offen lassen — dann fragt der Editor nicht wieder danach.
              </p>
              <div class="candrow" v-for="(c,i) in authCands" :key="i">
                <div>
                  <div class="fn">{{ c.label }} <span class="dim small" v-if="c.exact">exakt</span></div>
                  <div class="dim small">{{ c.id }}<span v-if="c.note"> · {{ c.note }}</span></div>
                </div>
                <button type="button" class="btn btn-primary btn-sm"
                        @click="setAuth({ id: c.id, label: c.label, note: c.note, art: c.type || '' })">Übernehmen</button>
              </div>
            </template>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-outline btn-sm" @click="setAuth({ id: null })">Bewusst offen lassen</button>
            <button type="button" class="btn btn-outline btn-sm" @click="closeAuth()">Abbrechen</button>
          </div>
        </div>
      </div>

      <div class="map-grid">
        <!-- Arbeitsfläche: eine Zeile je Quellspalte -->
        <div>
          <div class="tablewrap">
            <table class="maptable">
              <caption class="sr-only">Zuordnung der Quellspalten auf das AVefi-Schema</caption>
              <!-- Feste Breiten: die Tabelle soll nie breiter werden als ihr Platz.
                   Zu lange Werte werden gekürzt, der volle Text steht im Tooltip. -->
              <colgroup>
                <col style="width:18%">
                <col :style="{ width: merged ? '44%' : '24%' }">
                <col :style="{ width: merged ? '28%' : '25%' }">
                <col style="width:23%" v-if="!merged">
                <col style="width:76px">
              </colgroup>
              <thead><tr>
                <th scope="col">Quellspalte</th>
                <th scope="col" v-if="merged">Beispiel &rarr; Ergebnis</th>
                <th scope="col" v-else>Beispielwerte</th>
                <th scope="col">Ziel</th>
                <th scope="col" v-if="!merged">Ergebnis</th>
                <th scope="col"><span class="sr-only">Aktionen</span></th>
              </tr></thead>
              <tbody>
                <template v-for="col in columns" :key="col">
                  <tr :data-col="col" :class="{'row-open': !mapping.columns[col] || (!mapping.columns[col].ignore && !(mapping.columns[col].targets||[]).length),
                               'row-ignored': mapping.columns[col] && mapping.columns[col].ignore}">
                    <td>
                      <div class="fn">{{ col }}</div>
                      <div class="dim small" v-if="mapping.columns[col] && mapping.columns[col].ignore">ignoriert</div>
                      <div class="dim small" :class="fillSparse(col) ? 'fillhint' : ''"
                           v-if="fillLabel(col)">{{ fillLabel(col) }}</div>
                    </td>
                    <td class="excell">
                      <template v-if="examplesOf(col).length">
                        <div v-for="(e,i) in examplesOf(col)" :key="i" class="exline">
                          <span class="exraw" :title="e.raw">{{ e.raw }}</span>
                          <span class="dim excount" v-if="e.count > 1">{{ e.count }}&times;</span>
                          <template v-if="merged">
                            <i class="fa-solid fa-arrow-right-long exarrow" aria-hidden="true"></i>
                            <span v-if="valuesOf(e).length" class="okval">
                              <i class="fa-solid fa-check" aria-hidden="true"></i>{{ valuesOf(e).join(' · ') }}</span>
                            <span v-else-if="e.errors.length" class="errval" :title="e.errors.join(' · ')">
                              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>{{ e.errors[0] }}</span>
                            <span v-else class="dim">kein Wert</span>
                          </template>
                        </div>
                      </template>
                      <span class="dim small" v-else-if="filledOf(col) && !filledOf(col).n">in der Stichprobe durchgehend leer</span>
                      <span class="dim" v-else>–</span>
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
                    <td class="mapresult" v-if="!merged">
                      <template v-if="examplesOf(col).length">
                        <div v-for="(e,i) in examplesOf(col)" :key="i" class="exline">
                          <span v-if="valuesOf(e).length" class="okval">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>{{ valuesOf(e).join(' · ') }}<template
                              v-for="(o,k) in (e.outputs||[])" :key="'id'+k"><span v-if="o.ids" class="idchip"
                                :title="o.ids.map(function(x){return x.note;}).join(' · ')">{{
                                o.ids.map(function(x){return x.id;}).join(' · ') }}</span></template></span>
                          <span v-else-if="e.errors.length" class="errval" :title="e.errors.join(' · ')">
                            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>{{ e.errors[0] }}</span>
                          <span v-else class="dim">kein Wert</span>
                        </div>
                      </template>
                      <span class="dim" v-else>–</span>
                    </td>
                    <td class="maprowbtns">
                      <div class="rowbtns">
                      <button type="button" class="iconbtn-menu" @click="toggleOpen(col)"
                              :aria-expanded="open[col] ? 'true' : 'false'" :aria-label="'Kette für ' + col + ' bearbeiten'"
                              title="Konverter-Kette">
                        <i class="fa-solid" :class="open[col] ? 'fa-chevron-up' : 'fa-sliders'" aria-hidden="true"></i></button>
                      <button type="button" class="iconbtn-menu" @click="toggleIgnore(col)"
                              :aria-pressed="spec(col).ignore ? 'true' : 'false'" :aria-label="'Spalte ' + col + ' ignorieren'"
                              title="Spalte ignorieren">
                        <i class="fa-solid fa-ban" aria-hidden="true"></i></button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="open[col]" :key="col + '-chain'" class="chainrow">
                    <td :colspan="merged ? 4 : 5">
                      <!-- Verzweigung: Spalte → globale Kette → je Zweig eigene Kette und Ziel -->
                      <div class="branch">
                        <div class="branch-src">
                          <span class="branch-col"><i class="fa-solid fa-table-columns" aria-hidden="true"></i> {{ col }}</span>
                          <span class="dim small" v-if="fillLabel(col)">{{ fillLabel(col) }}</span>
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

                              <div class="branch-result" v-if="examplesOf(col).length">
                                <div v-for="(e,j) in examplesOf(col)" :key="j" class="exline">
                                  <span class="exraw" :title="e.raw">{{ e.raw }}</span>
                                  <i class="fa-solid fa-arrow-right-long exarrow" aria-hidden="true"></i>
                                  <span v-if="outputsFor(e, t.target).length" class="okval">
                                    <i class="fa-solid fa-check" aria-hidden="true"></i>{{ outputsFor(e, t.target).map(function(o){return o.value;}).join(' · ') }}</span>
                                  <span v-else-if="e.errors.length" class="errval" :title="e.errors.join(' · ')">
                                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>{{ e.errors[0] }}</span>
                                  <span v-else class="dim">kein Wert</span>
                                </div>
                              </div>
                              <div class="branch-result dim small" v-else>
                                Diese Spalte ist in der Stichprobe leer — kein Beispiel möglich.
                              </div>

                              <div class="authpanel" v-if="authStepOf(col,i)">
                                <div class="authpanel-h">
                                  <i class="fa-solid fa-id-card" aria-hidden="true"></i>
                                  Normdaten aus {{ (authStepOf(col,i).source || 'gnd').toUpperCase() }}
                                  <span class="dim small">— bestätigte Zuordnungen gelten vor der Automatik</span>
                                </div>
                                <div class="authrow" v-for="v in authValues(col)" :key="v">
                                  <span class="authval" :title="v">{{ v }}</span>
                                  <span class="authstate" :class="'st-' + authState(authStepOf(col,i).source || 'gnd', v)">
                                    <template v-if="authState(authStepOf(col,i).source || 'gnd', v) === 'bestaetigt'">
                                      {{ authEntry(authStepOf(col,i).source || 'gnd', v).id }}
                                      <span class="dim">{{ authEntry(authStepOf(col,i).source || 'gnd', v).label }}</span>
                                    </template>
                                    <template v-else-if="authState(authStepOf(col,i).source || 'gnd', v) === 'verworfen'">
                                      bewusst offen gelassen
                                    </template>
                                    <template v-else>automatisch</template>
                                  </span>
                                  <button type="button" class="btn btn-outline btn-sm"
                                          @click="openAuth(col, authStepOf(col,i), v)">Zuordnen</button>
                                  <button type="button" class="linkbtn"
                                          v-if="authState(authStepOf(col,i).source || 'gnd', v) !== 'offen'"
                                          @click="clearAuth(authStepOf(col,i).source || 'gnd', v)">zurücksetzen</button>
                                </div>
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
            <details class="jsonbox" v-if="canonical">
              <summary>Erzeugter AVefi-Datensatz (erste Zeile)</summary>
              <pre class="mono">{{ canonicalJson }}</pre>
            </details>

            <div class="alert" role="status" v-if="schemaIssues.length" style="margin-top:10px">
              <b>Schema-Beanstandungen</b>
              <span class="dim small">in {{ evaluatedRows }} geprüften Zeilen</span>
              <ul class="tight"><li v-for="(s,i) in schemaIssues" :key="i">
                {{ s.message }} <span class="dim">({{ s.rows }}&times;)</span>
              </li></ul>
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
