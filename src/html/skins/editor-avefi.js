/*
 * AVefi-Datensatz-Editor (Vue3, global build).
 * Bearbeitet die echte AVefi-Struktur (WorkVariant / Manifestation / Item).
 * - Beliebig viele Titel, jeweils mit Typ (TitleTypeEnum).
 * - has_subject: Schlagwort / Person / Körperschaft / Ort mit proaktivem
 *   GND/Wikidata/VIAF-Autocomplete (same_as-IDs), schema-getrieben.
 * - Beteiligte als Tätigkeit (Activity) + Person mit ID.
 * UI-Modell <-> AVefi über parse()/serialize().
 */
(function () {
  "use strict";
  var boot;
  try { boot = JSON.parse(document.getElementById("editorBoot").textContent); } catch (e) { return; }
  if (!window.Vue) { document.getElementById("editorApp").innerHTML = "<div class='alert' role='alert'>Vue konnte nicht geladen werden.</div>"; return; }

  var CFG = boot.config || {};
  var ENUMS = CFG.enums || {};
  var RES = CFG.resourceTypes || {};

  /* ---------- Hilfen ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function firstYear(events) {
    var e = arr(events);
    for (var i = 0; i < e.length; i++) { var m = String(e[i] && e[i].has_date || "").match(/(\d{4})/); if (m) return m[1]; }
    return "";
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().trim().replace(/\s+/g, " "); }
  // Eindeutige Treffer: je Quelle genau EIN exakter Label-Treffer (sonst mehrdeutig → nicht vorschlagen).
  function confidentMatches(name, results) {
    var n = norm(name), bySrc = {};
    (results || []).forEach(function (r) { if (norm(r.label) === n) { (bySrc[r.source] = bySrc[r.source] || []).push(r); } });
    var out = [];
    Object.keys(bySrc).forEach(function (s) { if (bySrc[s].length === 1) out.push(bySrc[s][0]); });
    return out;
  }
  function sameAsEntry(r) { return { category: r.category, id: r.id, _label: r.label, _source: r.source, _description: r.description }; }
  function addSameAs(list, r) { if (!list.some(function (x) { return x.category === r.category && x.id === r.id; })) list.push(sameAsEntry(r)); }

  // Entfernt transiente (_…) Felder rekursiv und leere Werte.
  function cleanDeep(v) {
    if (Array.isArray(v)) { var a = v.map(cleanDeep).filter(function (x) { return x !== undefined; }); return a; }
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) {
        if (k.charAt(0) === "_") return;
        var c = cleanDeep(v[k]);
        if (c === undefined || c === null || c === "" || (Array.isArray(c) && !c.length)) return;
        o[k] = c;
      });
      return o;
    }
    if (typeof v === "string") { var s = v.trim(); return s === "" ? undefined : s; }
    return v;
  }

  var CAT_KIND = { "avefi:Subject": "subject", "avefi:GeographicName": "place" };
  function entityKind(o) {
    if (!o) return "subject";
    if (o.category === "avefi:Agent") return o.type === "CorporateBody" ? "corporate" : "person";
    return CAT_KIND[o.category] || "subject";
  }
  function kindMeta(kind) {
    var arrk = CFG.subjectKinds || [];
    for (var i = 0; i < arrk.length; i++) if (arrk[i].kind === kind) return arrk[i];
    return { kind: "subject", label: "Schlagwort", sources: [], categories: [] };
  }

  /* ---------- parse: AVefi -> UI-Modell ---------- */
  function parseEntity(o) {
    return { _kind: entityKind(o), has_name: o.has_name || "", same_as: arr(o.same_as).map(function (r) { return { category: r.category, id: r.id, _label: r.id, _source: srcOf(r.category) }; }) };
  }
  function srcOf(cat) { return String(cat || "").replace(/^avefi:/, "").replace(/Resource$/, ""); }

  function parse(record) {
    var w = record.work || {};
    var prod = null, others = [];
    arr(w.has_event).forEach(function (ev) {
      if (!prod && ev.category === "avefi:ProductionEvent") prod = ev; else others.push(ev);
    });
    prod = prod || {};
    var activities = arr(prod.has_activity).map(function (a) {
      var ag = arr(a.has_agent)[0] || {};
      return { category: a.category || "avefi:DirectingActivity", type: a.type || "", name: ag.has_name || "",
        same_as: arr(ag.same_as).map(function (r) { return { category: r.category, id: r.id, _label: r.id, _source: srcOf(r.category) }; }) };
    });
    return {
      work: {
        type: w.type || "Monographic",
        variant_type: w.variant_type || "",
        primaryTitle: { has_name: (w.has_primary_title || {}).has_name || "", type: (w.has_primary_title || {}).type || "PreferredTitle" },
        altTitles: arr(w.has_alternative_title).map(function (t) { return { has_name: t.has_name || "", type: t.type || "AlternativeTitle" }; }),
        productionYear: firstYear(w.has_event),
        activities: activities,
        subjects: arr(w.has_subject).map(parseEntity),
        events: others.map(function (e) { return { category: e.category || "avefi:PublicationEvent", type: e.type || "", has_date: e.has_date || "" }; }),
        genres: arr(w.has_genre).map(function (g) { return { has_name: g.has_name || "", same_as: arr(g.same_as).map(function (r) { return { category: r.category, id: r.id, _label: r.id, _source: srcOf(r.category) }; }) }; }),
        forms: arr(w.has_form).slice(),
        identifiers: arr(w.has_identifier).map(function (r) { return { resourceType: srcOf(r.category) + "Resource", id: r.id || "" }; }),
        notes: arr(w.has_note).slice(),
        sameAs: arr(w.same_as).map(function (r) { return { category: r.category, id: r.id, _label: r.id, _source: srcOf(r.category) }; })
      },
      manifestations: arr(record.manifestations).map(parseSub),
      items: arr(record.items).map(parseItem)
    };
  }
  function parseSub(m) {
    return {
      primaryTitle: { has_name: (m.has_primary_title || {}).has_name || "", type: (m.has_primary_title || {}).type || "TitleProper" },
      identifiers: arr(m.has_identifier).map(function (r) { return { resourceType: srcOf(r.category) + "Resource", id: r.id || "" }; }),
      notes: arr(m.has_note).slice(),
      _raw: m
    };
  }
  function parseItem(it) {
    return {
      primaryTitle: { has_name: (it.has_primary_title || {}).has_name || "", type: (it.has_primary_title || {}).type || "TitleProper" },
      element_type: it.element_type || "", has_colour_type: it.has_colour_type || "", has_sound_type: it.has_sound_type || "",
      has_frame_rate: it.has_frame_rate || "", has_access_status: it.has_access_status || "",
      duration: (it.has_duration || {}).has_value || "",
      languages: arr(it.in_language).map(function (l) { return { code: l.code || l.usage_language || "", usage: l.usage || "" }; }),
      identifiers: arr(it.has_identifier).map(function (r) { return { resourceType: srcOf(r.category) + "Resource", id: r.id || "" }; }),
      notes: arr(it.has_note).slice(),
      _raw: it
    };
  }

  /* ---------- serialize: UI-Modell -> AVefi ---------- */
  function sameAsOut(list) { return arr(list).map(function (r) { return { category: r.category, id: r.id }; }).filter(function (r) { return r.id; }); }
  function idsOut(list) { return arr(list).map(function (r) { return { category: (RES[r.resourceType] || {}).category || "avefi:LocalResource", id: r.id }; }).filter(function (r) { return r.id; }); }
  function titleOut(t, def) { if (!t || !String(t.has_name || "").trim()) return null; return { has_name: t.has_name.trim(), type: t.type || def }; }

  function serialize(m) {
    var w = m.work, work = { category: "avefi:WorkVariant", type: w.type || "Monographic" };
    var pt = titleOut(w.primaryTitle, "PreferredTitle"); if (pt) work.has_primary_title = pt;
    if (w.variant_type) work.variant_type = w.variant_type;
    var alt = arr(w.altTitles).map(function (t) { return titleOut(t, "AlternativeTitle"); }).filter(Boolean);
    if (alt.length) work.has_alternative_title = alt;

    // Produktionsereignis (Jahr + Beteiligte)
    var acts = arr(w.activities).map(function (a) {
      if (!String(a.name || "").trim() && !arr(a.same_as).length) return null;
      var agent = { category: "avefi:Agent", has_name: (a.name || "").trim() };
      var sa = sameAsOut(a.same_as); if (sa.length) agent.same_as = sa;
      var o = { category: a.category || "avefi:DirectingActivity", has_agent: [agent] };
      if (a.type) o.type = a.type;
      return o;
    }).filter(Boolean);
    var events = [];
    if (String(w.productionYear || "").trim() || acts.length) {
      var pe = { category: "avefi:ProductionEvent" };
      if (String(w.productionYear || "").trim()) pe.has_date = w.productionYear.trim();
      if (acts.length) pe.has_activity = acts;
      events.push(pe);
    }
    arr(w.events).forEach(function (e) {
      if (!String(e.has_date || "").trim() && !e.type) return;
      var o = { category: e.category || "avefi:PublicationEvent" };
      if (e.type) o.type = e.type; if (String(e.has_date || "").trim()) o.has_date = e.has_date.trim();
      events.push(o);
    });
    if (events.length) work.has_event = events;

    var subs = arr(w.subjects).map(function (s) {
      if (!String(s.has_name || "").trim()) return null;
      var meta = kindMeta(s._kind), o = { has_name: s.has_name.trim() };
      if (s._kind === "person") { o.category = "avefi:Agent"; o.type = "Person"; }
      else if (s._kind === "corporate") { o.category = "avefi:Agent"; o.type = "CorporateBody"; }
      else if (s._kind === "place") { o.category = "avefi:GeographicName"; }
      else { o.category = "avefi:Subject"; }
      var sa = sameAsOut(s.same_as); if (sa.length) o.same_as = sa;
      return o;
    }).filter(Boolean);
    if (subs.length) work.has_subject = subs;

    var gen = arr(w.genres).map(function (g) { if (!String(g.has_name || "").trim()) return null; var o = { has_name: g.has_name.trim() }; var sa = sameAsOut(g.same_as); if (sa.length) o.same_as = sa; return o; }).filter(Boolean);
    if (gen.length) work.has_genre = gen;
    if (arr(w.forms).length) work.has_form = w.forms.slice();
    var wid = idsOut(w.identifiers); if (wid.length) work.has_identifier = wid;
    var wnotes = arr(w.notes).map(function (n) { return String(n).trim(); }).filter(Boolean); if (wnotes.length) work.has_note = wnotes;
    var wsa = sameAsOut(w.sameAs); if (wsa.length) work.same_as = wsa;

    var manifestations = arr(m.manifestations).map(function (mf) {
      var o = clone(mf._raw) || {}; o.category = "avefi:Manifestation";
      var t = titleOut(mf.primaryTitle, "TitleProper"); if (t) o.has_primary_title = t; else delete o.has_primary_title;
      var id = idsOut(mf.identifiers); if (id.length) o.has_identifier = id;
      var n = arr(mf.notes).map(function (x) { return String(x).trim(); }).filter(Boolean); if (n.length) o.has_note = n; else delete o.has_note;
      if (!o.is_manifestation_of) o.is_manifestation_of = [];
      return o;
    });
    var items = arr(m.items).map(function (it) {
      var o = clone(it._raw) || {}; o.category = "avefi:Item";
      var t = titleOut(it.primaryTitle, "TitleProper"); if (t) o.has_primary_title = t; else delete o.has_primary_title;
      ["element_type", "has_colour_type", "has_sound_type", "has_frame_rate", "has_access_status"].forEach(function (k) { if (it[k]) o[k] = it[k]; else delete o[k]; });
      if (String(it.duration || "").trim()) o.has_duration = { has_value: it.duration.trim() }; else delete o.has_duration;
      var langs = arr(it.languages).map(function (l) { if (!l.code) return null; var lo = { code: l.code }; if (l.usage) lo.usage = l.usage; return lo; }).filter(Boolean);
      if (langs.length) o.in_language = langs; else delete o.in_language;
      var id = idsOut(it.identifiers); if (id.length) o.has_identifier = id;
      var n = arr(it.notes).map(function (x) { return String(x).trim(); }).filter(Boolean); if (n.length) o.has_note = n; else delete o.has_note;
      return o;
    });
    return { work: work, manifestations: manifestations, items: items };
  }

  /* ---------- Lookup ---------- */
  function lookup(kind, sources, q) {
    var url = boot.lookupUrl + "?kind=" + encodeURIComponent(kind) + "&q=" + encodeURIComponent(q) + (sources && sources.length ? "&sources=" + encodeURIComponent(sources.join(",")) : "");
    return fetch(url, { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) { return (j && j.results) || []; }).catch(function () { return []; });
  }

  var App = window.Vue.createApp({
    data: function () {
      return { m: parse(boot.record), config: CFG, tab: "work", saving: false, savedAt: 0, errors: [], completeness: boot.completeness || 0, showJson: false, matchingAll: false, detailOpen: false, detailLoading: false, detail: null };
    },
    provide: function () { var self = this; return { showDetail: function (s, id) { self.showDetail(s, id); } }; },
    computed: {
      titleText: function () { return this.m.work.primaryTitle.has_name || "Ohne Titel"; },
      avefiOut: function () { return serialize(this.m); },
      jsonText: function () { return JSON.stringify(this.avefiOut, null, 2); }
    },
    methods: {
      enumVals: function (name) { return ENUMS[name] || []; },
      addAlt: function () { this.m.work.altTitles.push({ has_name: "", type: "AlternativeTitle" }); },
      addSubject: function () { this.m.work.subjects.push({ _kind: "subject", has_name: "", same_as: [] }); },
      matchAll: function () {
        var self = this;
        var open = this.m.work.subjects.filter(function (s) { return (s.has_name || "").trim().length >= 3 && !(s.same_as || []).length; });
        if (!open.length) { if (window.AvefiModal) AvefiModal.alert("Keine offenen Begriffe ohne ID zum Abgleichen."); return; }
        this.matchingAll = true;
        var hit = 0;
        Promise.all(open.map(function (s) {
          return lookup(s._kind, kindMeta(s._kind).sources, s.has_name.trim()).then(function (rs) {
            var best = confidentMatches(s.has_name.trim(), rs);
            if (best.length) { if (!s.same_as) s.same_as = []; best.forEach(function (r) { addSameAs(s.same_as, r); }); s._suggest = []; hit++; }
          });
        })).then(function () {
          self.matchingAll = false;
          if (window.AvefiModal) AvefiModal.alert(hit + " von " + open.length + " Begriffen eindeutig zugeordnet (GND/Wikidata/VIAF).");
        });
      },
      addActivity: function () { this.m.work.activities.push({ category: "avefi:DirectingActivity", type: "", name: "", same_as: [] }); },
      addEvent: function () { this.m.work.events.push({ category: "avefi:PublicationEvent", type: "", has_date: "" }); },
      addGenre: function () { this.m.work.genres.push({ has_name: "", same_as: [] }); },
      addIdentifier: function (list) { list.push({ resourceType: "LocalResource", id: "" }); },
      addNote: function (list) { list.push(""); },
      addManifestation: function () { this.m.manifestations.push({ primaryTitle: { has_name: this.m.work.primaryTitle.has_name, type: "TitleProper" }, identifiers: [], notes: [], _raw: { category: "avefi:Manifestation", is_manifestation_of: [] } }); },
      addItem: function () { this.m.items.push({ primaryTitle: { has_name: this.m.work.primaryTitle.has_name, type: "TitleProper" }, element_type: "", has_colour_type: "", has_sound_type: "", has_frame_rate: "", has_access_status: "", duration: "", languages: [], identifiers: [], notes: [], _raw: { category: "avefi:Item" } }); },
      rm: function (list, i) { list.splice(i, 1); },
      pid: function () { if (window.AvefiModal) AvefiModal.alert({ title: "PID-Registrierung", message: "Diese Funktion ist noch nicht freigeschaltet. Die PID-Vergabe übernimmt AVefi zu einem späteren Zeitpunkt." }); },
      showDetail: function (source, id) {
        if (!source || !id) return;
        var self = this; this.detailOpen = true; this.detailLoading = true; this.detail = null;
        fetch(boot.lookupUrl + "/detail?source=" + encodeURIComponent(source) + "&id=" + encodeURIComponent(id), { credentials: "same-origin" })
          .then(function (r) { return r.json(); })
          .then(function (j) { self.detailLoading = false; self.detail = (j && j.detail) || null; })
          .catch(function () { self.detailLoading = false; self.detail = { title: id, description: "Detail konnte nicht geladen werden.", extract: "", image: "", url: "", wikiUrl: "" }; });
      },
      closeDetail: function () { this.detailOpen = false; this.detail = null; },
      save: function () {
        var self = this; if (this.saving) return; this.saving = true;
        var payload = serialize(this.m); payload._csrf = boot.csrf;
        fetch(boot.saveUrl, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Serverfehler" }; }); })
          .then(function (res) {
            self.saving = false;
            if (res && res.ok) { self.errors = res.errors || []; self.completeness = res.completeness; self.savedAt = Date.now();
              if (window.AvefiUI && window.AvefiUI.toast) AvefiUI.toast("Gespeichert."); }
            else if (window.AvefiModal) AvefiModal.alert((res && res.error) || "Speichern fehlgeschlagen.");
          })
          .catch(function () { self.saving = false; if (window.AvefiModal) AvefiModal.alert("Netzwerkfehler beim Speichern."); });
      }
    },
    template: document.getElementById("editorTpl") ? document.getElementById("editorTpl").innerHTML : ""
  });

  /* ---------- Komponenten ---------- */
  // Enum-Dropdown
  App.component("enum-select", {
    props: ["modelValue", "enumName", "placeholder"],
    emits: ["update:modelValue"],
    computed: { vals: function () { return ENUMS[this.enumName] || []; } },
    template:
      '<select class="input" :value="modelValue" @change="$emit(\'update:modelValue\',$event.target.value)">' +
        '<option value="">{{ placeholder || \"—\" }}</option>' +
        '<option v-for="v in vals" :key="v" :value="v">{{ v }}</option>' +
      '</select>'
  });

  // same_as-Chips
  App.component("same-as", {
    props: ["list"],
    inject: { showDetail: { default: function () { return function () {}; } } },
    methods: {
      src: function (r) { return r._source || srcOf(r.category); },
      title: function (r) { return [r._label, r._description, r.id].filter(function (x) { return x && x !== ""; }).join(" · ") + " — Details anzeigen"; },
      rm: function (i) { this.list.splice(i, 1); }
    },
    template:
      '<span class="chips" v-if="list && list.length">' +
        '<span class="idbadge" v-for="(r,i) in list" :key="i">' +
          '<button type="button" class="idbadge-info" :title="title(r)" @click="showDetail(src(r).toLowerCase(), r.id)">' +
            '<span class="idbadge-src" :class="\'src-\'+src(r).toLowerCase()">{{ src(r) }}</span>' +
            '<span class="idbadge-lab" v-if="r._label && r._label!==r.id">{{ r._label }}</span>' +
            '<span class="idbadge-desc" v-if="r._description">{{ r._description }}</span>' +
            '<span class="idbadge-id">{{ r.id }}</span>' +
          '</button>' +
          '<button type="button" class="idbadge-x" @click="rm(i)" aria-label="ID entfernen">×</button>' +
        '</span>' +
      '</span>'
  });

  // Authority-Autocomplete-Feld
  App.component("authority-field", {
    props: ["modelValue", "kind", "sources", "placeholder"],
    emits: ["update:modelValue", "pick"],
    data: function () { return { open: false, loading: false, results: [], hi: -1 }; },
    created: function () { this.run = debounce(this.search, 300); },
    methods: {
      onInput: function (e) { this.$emit("update:modelValue", e.target.value); if (e.target.value.trim().length >= 2) { this.loading = true; this.run(); } else { this.results = []; this.open = false; } },
      search: function () { var self = this; lookup(this.kind, this.sources, this.modelValue).then(function (rs) { self.results = rs; self.loading = false; self.open = rs.length > 0; self.hi = -1; }); },
      pick: function (r) { this.$emit("update:modelValue", r.label); this.$emit("pick", r); this.open = false; this.results = []; },
      blur: function () { var self = this; setTimeout(function () { self.open = false; }, 150); }
    },
    template:
      '<div class="ac-wrap">' +
        '<input class="input" :value="modelValue" :placeholder="placeholder" @input="onInput" @focus="open=results.length>0" @blur="blur" autocomplete="off">' +
        '<div class="ac-menu" v-if="open">' +
          '<button type="button" class="ac-item" v-for="(r,i) in results" :key="i" @mousedown.prevent="pick(r)">' +
            '<span class="ac-src" :class="\'src-\'+r.source">{{ r.source }}</span>' +
            '<span class="ac-lab">{{ r.label }}</span>' +
            '<span class="ac-desc" v-if="r.description">{{ r.description }}</span>' +
            '<span class="ac-id">{{ r.id }}</span>' +
          '</button>' +
        '</div>' +
        '<div class="ac-menu" v-else-if="loading"><div class="ac-item dim"><i class="fa-solid fa-spinner fa-spin"></i> sucht …</div></div>' +
      '</div>'
  });

  // Entity-Zeile (Subject/Person/Körperschaft/Ort)
  App.component("entity-row", {
    props: ["entity"],
    inject: { showDetail: { default: function () { return function () {}; } } },
    computed: {
      kinds: function () { return CFG.subjectKinds || []; },
      meta: function () { return kindMeta(this.entity._kind); },
      hasId: function () { return (this.entity.same_as || []).length > 0; }
    },
    created: function () {
      this.runMatch = debounce(this.match, 450);
      if (this.entity.has_name && !this.hasId) this.runMatch();
    },
    watch: {
      "entity.has_name": function () { if (this.hasId) this.entity._suggest = []; else this.runMatch(); },
      "entity._kind": function () { if (!this.hasId) this.runMatch(); }
    },
    methods: {
      match: function () {
        var self = this, name = (this.entity.has_name || "").trim();
        if (name.length < 3 || this.hasId) { this.entity._suggest = []; return; }
        lookup(this.entity._kind, this.meta.sources, name).then(function (rs) { self.entity._suggest = confidentMatches(name, rs); });
      },
      pick: function (r) { if (!this.entity.same_as) this.entity.same_as = []; addSameAs(this.entity.same_as, r); this.entity._suggest = []; },
      accept: function () { var self = this; if (!this.entity.same_as) this.entity.same_as = []; (this.entity._suggest || []).forEach(function (r) { addSameAs(self.entity.same_as, r); }); this.entity._suggest = []; },
      dismiss: function () { this.entity._suggest = []; }
    },
    template:
      '<div class="ed-entity">' +
        '<select class="input kindsel" v-model="entity._kind" aria-label="Art">' +
          '<option v-for="k in kinds" :key="k.kind" :value="k.kind">{{ k.label }}</option>' +
        '</select>' +
        '<div class="ed-entity-main">' +
          '<authority-field v-model="entity.has_name" :kind="entity._kind" :sources="meta.sources" :placeholder="meta.label+\' suchen …\'" @pick="pick"></authority-field>' +
          '<same-as :list="entity.same_as"></same-as>' +
          '<div class="ed-suggest" v-if="!hasId && entity._suggest && entity._suggest.length">' +
            '<span class="ed-suggest-lbl">Vorschlag:</span>' +
            '<button type="button" class="idbadge idbadge-info" v-for="r in entity._suggest" :key="r.source+r.id" :title="(r.description||\'\')+\' — Details anzeigen\'" @click="showDetail(r.source, r.id)">' +
              '<span class="idbadge-src" :class="\'src-\'+r.source">{{ r.source }}</span>' +
              '<span class="idbadge-lab">{{ r.label }}</span><span class="idbadge-id">{{ r.id }}</span>' +
            '</button>' +
            '<button type="button" class="btn btn-outline btn-xs" @click="accept">Übernehmen</button>' +
            '<button type="button" class="linkbtn" @click="dismiss" aria-label="Vorschlag verwerfen">×</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="iconbtn-del" @click="$emit(\'remove\')" aria-label="Eintrag entfernen"><span aria-hidden="true">🗑</span></button>' +
      '</div>'
  });

  // Beteiligte-Zeile
  App.component("activity-row", {
    props: ["act"],
    computed: {
      cats: function () { return CFG.activityCategories || []; },
      typeEnum: function () { var cats = CFG.activityCategories || []; for (var i = 0; i < cats.length; i++) if (cats[i].category === this.act.category) return cats[i].enum; return ""; }
    },
    methods: { pick: function (r) { if (!this.act.same_as) this.act.same_as = []; addSameAs(this.act.same_as, r); } },
    template:
      '<div class="ed-entity">' +
        '<select class="input kindsel" v-model="act.category">' +
          '<option v-for="c in cats" :key="c.category" :value="c.category">{{ c.label }}</option>' +
        '</select>' +
        '<enum-select class="rolesel" v-model="act.type" :enum-name="typeEnum" placeholder="Rolle"></enum-select>' +
        '<div class="ed-entity-main">' +
          '<authority-field v-model="act.name" kind="person" :sources="[\'gnd\',\'wikidata\',\'viaf\']" placeholder="Person suchen …" @pick="pick"></authority-field>' +
          '<same-as :list="act.same_as"></same-as>' +
        '</div>' +
        '<button type="button" class="iconbtn-del" @click="$emit(\'remove\')" aria-label="Beteiligte entfernen"><span aria-hidden="true">🗑</span></button>' +
      '</div>'
  });

  App.mount("#editorApp");
})();
