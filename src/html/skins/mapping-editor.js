/*
 * Mapping-Editor (Vue 3, global build).
 *
 * Arbeitsfläche ist eine Tabelle mit einer Zeile je Quellspalte — nicht zwei
 * Spalten mit Verbindungslinien. Die sehen bei fünf Spalten gut aus und werden bei
 * vierzig unbedienbar, besonders mit Tastatur oder Screenreader. Die „grafische"
 * Hälfte ist stattdessen der Ergebnisbaum rechts: er zeigt die AVefi-Struktur, die
 * entsteht, statt der Linien dorthin.
 *
 * Die Vorschau rechnet der Server (POST …/mapping/preview) mit demselben Code, der
 * später konvertiert. Eine zweite Umsetzung hier im Browser wäre schneller, könnte
 * aber grün zeigen, was hinterher rot ist.
 */
(function () {
  "use strict";

  var boot;
  try { boot = JSON.parse(document.getElementById("mappingBoot").textContent); } catch (e) { return; }
  var mount = document.getElementById("mappingApp");
  if (!mount) return;
  if (!window.Vue) { mount.innerHTML = "<div class='alert' role='alert'>Vue konnte nicht geladen werden.</div>"; return; }

  function clone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }

  /* Füllt fehlende Strukturen einmalig auf: jede Spalte hat pre/targets, jedes Ziel
     eine Nachkette. Danach darf das Template nur noch lesen. */
  function normalize(m, columns) {
    m = m || {};
    m.columns = m.columns || {};
    columns.forEach(function (c) {
      var s = m.columns[c];
      if (!s || typeof s !== "object") s = m.columns[c] = {};
      if (!Array.isArray(s.pre)) s.pre = [];
      if (!Array.isArray(s.targets)) s.targets = [];
      s.targets.forEach(function (t) { if (!Array.isArray(t.post)) t.post = []; });
    });
    if (!Array.isArray(m.defaults)) m.defaults = [];
    if (!m.row) m.row = { represents: "item" };
    if (!m.grouping) m.grouping = { work: { by: [] }, manifestation: { by: [] } };
    if (!m.grouping.work) m.grouping.work = { by: [] };
    if (!Array.isArray(m.grouping.work.by)) m.grouping.work.by = [];
    return m;
  }

  var TARGETS = {};
  boot.targets.forEach(function (t) { TARGETS[t.key] = t; });

  /* Ziele nach Ebene und Gruppe für die Auswahlliste. */
  var TARGET_GROUPS = (function () {
    var order = ["work", "manifestation", "item"], out = [];
    order.forEach(function (lvl) {
      var groups = {};
      boot.targets.forEach(function (t) {
        if (t.level !== lvl) return;
        (groups[t.group] = groups[t.group] || []).push(t);
      });
      Object.keys(groups).forEach(function (g) {
        out.push({ label: (lvl === "work" ? "Werk" : lvl === "manifestation" ? "Fassung" : "Exemplar") + " › " + g, items: groups[g] });
      });
    });
    return out;
  })();

  /* ---------------- Kette: ein Schritt ---------------- */

  var StepEditor = {
    props: ["step", "columns"],
    emits: ["remove", "change"],
    computed: {
      meta: function () { return boot.transforms[this.step.op] || null; },
      params: function () { return this.meta ? (this.meta.params || []) : []; }
    },
    methods: {
      val: function (name) { return this.step[name]; },
      set: function (name, v) { this.step[name] = v; this.$emit("change"); },
      mapText: function () {
        var m = this.step.map || {}, lines = [];
        Object.keys(m).forEach(function (k) { lines.push(k + " = " + m[k]); });
        return lines.join("\n");
      },
      setMapText: function (text) {
        var m = {};
        String(text || "").split("\n").forEach(function (line) {
          var i = line.indexOf("=");
          if (i < 0) return;
          var k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
          if (k !== "") m[k] = v;
        });
        this.step.map = m;
        this.$emit("change");
      },
      toggleColumn: function (c) {
        var list = arr(this.step.columns).slice();
        var i = list.indexOf(c);
        if (i >= 0) list.splice(i, 1); else list.push(c);
        this.step.columns = list;
        this.$emit("change");
      }
    },
    template: [
      '<div class="step">',
      '  <div class="step-head">',
      '    <span class="step-name">{{ meta ? meta.label : step.op }}</span>',
      '    <span v-if="meta && meta.slow" class="badge b-wait" title="Fragt externe Dienste ab"><span class="bd"></span>langsam</span>',
      '    <button type="button" class="iconbtn-del" @click="$emit(\'remove\')" :aria-label="(meta?meta.label:step.op)+\' entfernen\'">',
      '      <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>',
      '  </div>',
      '  <div class="step-params" v-if="params.length">',
      '    <label v-for="p in params" :key="p.name" class="step-param">',
      '      <span class="step-plabel">{{ p.label }}</span>',
      '      <textarea v-if="p.type===\'map\'" class="input mono" rows="4" :value="mapText()"',
      '                @change="setMapText($event.target.value)"',
      '                placeholder="Quellwert = Zielwert (eine Zuordnung je Zeile)"></textarea>',
      '      <select v-else-if="p.type===\'choice\'" class="input" :value="val(p.name)" @change="set(p.name,$event.target.value)">',
      '        <option v-for="(lbl,k) in p.choices" :key="k" :value="k">{{ lbl }}</option>',
      '      </select>',
      '      <input v-else-if="p.type===\'bool\'" type="checkbox" :checked="!!val(p.name)" @change="set(p.name,$event.target.checked)">',
      '      <input v-else-if="p.type===\'int\'" class="input" type="number" :value="val(p.name)" @change="set(p.name,$event.target.value)">',
      '      <div v-else-if="p.type===\'columns\'" class="step-cols">',
      '        <label v-for="c in columns" :key="c" class="checkline">',
      '          <input type="checkbox" :checked="(step.columns||[]).indexOf(c)>=0" @change="toggleColumn(c)"> {{ c }}',
      '        </label>',
      '      </div>',
      '      <input v-else class="input" type="text" :value="val(p.name)" @change="set(p.name,$event.target.value)">',
      '    </label>',
      '  </div>',
      '</div>'
    ].join("")
  };

  /* ---------------- Kette ---------------- */

  var ChainEditor = {
    components: { "step-editor": StepEditor },
    props: ["chain", "columns", "label"],
    emits: ["change"],
    data: function () { return { picking: false }; },
    computed: {
      grouped: function () {
        var g = {};
        Object.keys(boot.transforms).forEach(function (op) {
          var m = boot.transforms[op];
          (g[m.group] = g[m.group] || []).push({ op: op, meta: m });
        });
        return g;
      }
    },
    methods: {
      add: function (op) {
        var meta = boot.transforms[op], step = { op: op };
        (meta.params || []).forEach(function (p) {
          if (p.type === "choice") step[p.name] = Object.keys(p.choices)[0];
          if (p.type === "map") step.map = {};
          if (p.type === "columns") step.columns = [];
        });
        if (op === "valuemap" && !step.fallback) step.fallback = "keep_note";
        this.chain.push(step);
        this.picking = false;
        this.$emit("change");
      },
      remove: function (i) { this.chain.splice(i, 1); this.$emit("change"); }
    },
    template: [
      '<div class="chain">',
      '  <div class="chain-label" v-if="label">{{ label }}</div>',
      '  <step-editor v-for="(s,i) in chain" :key="i" :step="s" :columns="columns"',
      '               @remove="remove(i)" @change="$emit(\'change\')"></step-editor>',
      '  <div class="chain-add">',
      '    <button type="button" class="btn btn-outline btn-sm" @click="picking=!picking" :aria-expanded="picking?\'true\':\'false\'">',
      '      <i class="fa-solid fa-plus" aria-hidden="true"></i> Konverter</button>',
      '    <div class="chain-picker" v-if="picking">',
      '      <div v-for="(items,g) in grouped" :key="g" class="chain-pgroup">',
      '        <div class="chain-pgroup-h">{{ g }}</div>',
      '        <button type="button" class="chain-pitem" v-for="it in items" :key="it.op" @click="add(it.op)">{{ it.meta.label }}</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("")
  };

  /* ---------------- Anwendung ---------------- */

  var app = Vue.createApp({
    components: { "chain-editor": ChainEditor },
    data: function () {
      return {
        mapping: normalize(clone(boot.mapping), boot.columns),
        name: boot.profile ? boot.profile.name : boot.suggestedName,
        columns: boot.columns.slice(),
        rows: boot.rows,
        targetGroups: TARGET_GROUPS,
        targets: TARGETS,
        foreign: boot.foreign || [],
        suggestions: boot.suggestions || {},
        hints: boot.hints || {},
        vocabulary: boot.vocabulary || {},
        open: {},            // aufgeklappte Spalten
        preview: null,
        checks: [],
        schemaIssues: [],
        coverage: {},
        canStart: !!boot.canStart,
        subject: boot.subject,
        busy: false,
        saving: false,
        message: null,
        error: null,
        adoptNote: null
      };
    },
    computed: {
      openColumns: function () {
        var self = this, out = [];
        this.columns.forEach(function (c) {
          var s = self.mapping.columns[c];
          if (!s || (!s.ignore && !(s.targets || []).length)) out.push(c);
        });
        return out;
      },
      complete: function () { return this.openColumns.length === 0 && this.mappedCount > 0; },
      mappedCount: function () {
        var self = this, n = 0;
        this.columns.forEach(function (c) {
          var s = self.mapping.columns[c];
          if (s && !s.ignore && (s.targets || []).length) n++;
        });
        return n;
      },
      ignoredCount: function () {
        var self = this, n = 0;
        this.columns.forEach(function (c) { var s = self.mapping.columns[c]; if (s && s.ignore) n++; });
        return n;
      },
      blockers: function () { return this.checks.filter(function (c) { return c.level === "nogo"; }); },
      warnings: function () { return this.checks.filter(function (c) { return c.level === "warn"; }); },
      /* Ergebnisbaum: belegte Ziele je Ebene. */
      tree: function () {
        var self = this, levels = { work: [], manifestation: [], item: [] };
        Object.keys(this.coverage).forEach(function (key) {
          var t = self.targets[key];
          if (!t) return;
          levels[t.level].push({ key: key, label: t.label, group: t.group, from: self.coverage[key] });
        });
        Object.keys(levels).forEach(function (l) {
          levels[l].sort(function (a, b) { return (a.group + a.label).localeCompare(b.group + b.label); });
        });
        return levels;
      },
      groupingBy: function () { return (this.mapping.grouping && this.mapping.grouping.work && this.mapping.grouping.work.by) || []; }
    },
    methods: {
      /* Reines Lesen — das Auffüllen passiert einmalig in normalize(), nicht beim
         Rendern. Eine Mutation während des Renderns würde Vue in eine Schleife schicken. */
      spec: function (col) { return this.mapping.columns[col]; },
      sampleOf: function (col) {
        var out = [];
        for (var i = 0; i < this.rows.length && out.length < 3; i++) {
          var v = (this.rows[i][col] || "").trim();
          if (v !== "" && out.indexOf(v) < 0) out.push(v);
        }
        return out;
      },
      resultOf: function (col) {
        if (!this.preview || !this.preview.length) return null;
        return this.preview[0].cells[col] || null;
      },
      /* Ergebnis eines einzelnen Zweigs — die Vorschau liefert je Ausgabe das Ziel mit. */
      resultFor: function (col, targetKey) {
        var c = this.resultOf(col);
        if (!c) return null;
        return { outputs: c.outputs.filter(function (o) { return o.target === targetKey; }), errors: c.errors };
      },
      branchCount: function (col) { return (this.spec(col).targets || []).length; },
      targetsOf: function (col) {
        var self = this;
        return (this.spec(col).targets || []).map(function (t) { return self.targets[t.target] || null; });
      },
      toggleOpen: function (col) { this.open[col] = !this.open[col]; },
      toggleIgnore: function (col) {
        var s = this.spec(col);
        s.ignore = !s.ignore;
        if (s.ignore) { s.targets = []; }
        this.refresh();
      },
      addTarget: function (col, key) {
        var s = this.spec(col);
        s.ignore = false;
        s.targets.push({ target: key || "", post: [] });
        this.open[col] = true;
        this.refresh();
      },
      removeTarget: function (col, i) { this.spec(col).targets.splice(i, 1); this.refresh(); },
      acceptSuggestion: function (col, key) { this.addTarget(col, key); },
      targetLabel: function (key) {
        var t = this.targets[key];
        return t ? t.path : key;
      },
      /* Autofix aus der statischen Prüfung: fehlenden Konverter einsetzen. */
      applyFix: function (check) {
        if (!check.fix || !check.column) return;
        var s = this.spec(check.column);
        var step = clone(check.fix);
        if (step.op === "valuemap") {
          step.map = {};
          step.fallback = "keep_note";
          var vals = this.vocabulary[check.column] || [];
          var tkey = (s.targets[0] || {}).target;
          var t = this.targets[tkey];
          vals.forEach(function (v) { step.map[v] = ""; });
          if (t && t.enum && t.enum.length) step._enum = t.enum;
        }
        (s.targets[0] ? (s.targets[0].post = s.targets[0].post || []) : s.pre).push(step);
        this.open[check.column] = true;
        this.refresh();
      },
      enumFor: function (col, i) {
        var s = this.spec(col), t = s.targets[i];
        if (!t) return null;
        var target = this.targets[t.target];
        return target && target.enum ? target.enum : null;
      },
      /* Vokabular vorbefüllen: die tatsächlich vorkommenden Werte als Zeilen. */
      prefillVocabulary: function (col, i) {
        var s = this.spec(col), t = s.targets[i];
        if (!t) return;
        var vals = this.vocabulary[col] || [];
        if (!vals.length) { this.error = "Diese Spalte hat zu viele verschiedene Werte für eine Werteliste."; return; }
        t.post = t.post || [];
        var vm = null;
        t.post.forEach(function (st) { if (st.op === "valuemap") vm = st; });
        if (!vm) { vm = { op: "valuemap", map: {}, fallback: "keep_note" }; t.post.push(vm); }
        vals.forEach(function (v) { if (!(v in vm.map)) vm.map[v] = ""; });
        this.open[col] = true;
        this.refresh();
      },

      /* --- Festwerte --- */
      addDefault: function () {
        if (!this.mapping.defaults) this.mapping.defaults = [];
        this.mapping.defaults.push({ target: "", value: "" });
      },
      removeDefault: function (i) { this.mapping.defaults.splice(i, 1); this.refresh(); },

      /* --- Werkbildung --- */
      toggleGrouping: function (key) {
        if (!this.mapping.grouping) this.mapping.grouping = { work: { by: [] } };
        if (!this.mapping.grouping.work) this.mapping.grouping.work = { by: [] };
        var by = this.mapping.grouping.work.by || [];
        var i = by.indexOf(key);
        if (i >= 0) by.splice(i, 1); else by.push(key);
        this.mapping.grouping.work.by = by;
        this.refresh();
      },
      groupingCandidates: function () {
        var self = this, out = [];
        Object.keys(this.coverage).forEach(function (key) {
          var t = self.targets[key];
          if (t && t.level === "work") out.push({ key: "target:" + key, label: t.label });
        });
        this.columns.forEach(function (c) { out.push({ key: "column:" + c, label: "Spalte „" + c + "“" }); });
        return out;
      },

      /* --- Server --- */
      post: function (action, body) {
        body._csrf = boot.csrf;
        // Derselbe Editor bedient zwei Betriebsarten: an einem Import
        // (/imports/<uuid>/mapping) und an einem gespeicherten Profil (/mappings/<id>).
        return fetch(boot.endpoint + "/" + action, {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server antwortete nicht in JSON." }; }); });
      },
      refresh: debounce(function () { this.runPreview(); }, 350),
      runPreview: function () {
        var self = this;
        this.busy = true;
        this.post("preview", { mapping: this.mapping, limit: 8 }).then(function (res) {
          self.busy = false;
          if (!res.ok) { self.error = res.error || "Vorschau fehlgeschlagen."; return; }
          self.error = null;
          self.preview = res.rows;
          self.checks = res.checks || [];
          self.schemaIssues = res.schema || [];
          self.coverage = res.coverage || {};
        }).catch(function () { self.busy = false; self.error = "Vorschau fehlgeschlagen — keine Verbindung."; });
      },
      adopt: function (p) {
        var self = this;
        AvefiModal.confirm({
          title: "Profil übernehmen",
          message: "Die Zuordnung von „" + p.institution_name + "“ wird als Kopie übernommen. Änderungen wirken sich nicht auf das ursprüngliche Profil aus.",
          okText: "Übernehmen",
          onConfirm: function () {
            self.post("adopt", { profile_id: p.id }).then(function (res) {
              if (!res.ok) { self.error = res.error; return; }
              self.mapping = normalize(res.mapping, self.columns);
              self.adoptNote = "Übernommen von „" + p.name + "“: " + res.matched.length + " Spalten zugeordnet"
                             + (res.missing.length ? ", " + res.missing.length + " offen" : "")
                             + (res.extra.length ? ", " + res.extra.length + " im Quellprofil ohne Entsprechung" : "") + ".";
              self.runPreview();
            });
          }
        });
      },
      save: function (start) {
        var self = this;
        if (start && !this.complete) {
          AvefiModal.alert({
            title: "Noch nicht vollständig",
            message: "Es " + (this.openColumns.length === 1 ? "ist noch eine Spalte" : "sind noch " + this.openColumns.length + " Spalten")
                   + " unbeantwortet: " + this.openColumns.join(", ") + ". Ordne sie zu oder markiere sie als „ignorieren“."
          });
          return;
        }
        this.saving = true;
        this.post("save", { mapping: this.mapping, name: this.name, start: !!start }).then(function (res) {
          self.saving = false;
          if (!res.ok) {
            self.error = res.error || "Speichern fehlgeschlagen.";
            if (res.checks) self.checks = res.checks;
            return;
          }
          if (res.started) { window.location.href = "/?added=1"; return; }
          if (res.profile && !boot.profile) boot.profile = res.profile;   // erstes Speichern
          self.error = null;
          self.message = "Profil „" + res.profile.name + "“ gespeichert (Fassung " + res.profile.version + ").";
        }).catch(function () { self.saving = false; self.error = "Speichern fehlgeschlagen — keine Verbindung."; });
      }
    },
    mounted: function () {
      this.runPreview();
    }
  });

  app.mount(mount);
})();
