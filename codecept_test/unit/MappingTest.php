<?php

/*
 * MappingTest — Kopfzeilen-Hash, Konverter-Ketten, Zieltypen, Profil-Ausführung
 * und Werkbildung. Deckt die Zusagen ab, auf denen der Mapping-Editor aufsetzt.
 */
class MappingTest extends \Codeception\Test\Unit
{
    protected $tester;

    /* ==================== TableHeader ==================== */

    public function testHashIgnoriertSpaltenreihenfolge()
    {
        // Das Mapping adressiert Spalten über den Namen — ein umsortierter Export
        // muss deshalb dasselbe Profil finden.
        $a = TableHeader::hash(["Titel", "Jahr", "Regie"], "csv");
        $b = TableHeader::hash(["Regie", "Titel", "Jahr"], "csv");
        $this->assertSame($a, $b);
    }

    public function testHashIgnoriertGrossschreibungUndLeerraum()
    {
        $this->assertSame(
            TableHeader::hash(["Titel", "Jahr"], "csv"),
            TableHeader::hash(["  TITEL ", "jahr"], "csv")
        );
    }

    public function testHashUnterscheidetUmlaute()
    {
        // „Länge" und „Lange" sind verschiedene Spalten — Umlaute werden nicht aufgelöst.
        $this->assertNotSame(TableHeader::hash(["Länge"], "csv"), TableHeader::hash(["Lange"], "csv"));
    }

    public function testHashUnterscheidetBasisformat()
    {
        $this->assertNotSame(TableHeader::hash(["Titel"], "csv"), TableHeader::hash(["Titel"], "tsv"));
    }

    public function testDoppelteSpaltennamenWerdenEindeutig()
    {
        // Die Schreibweise aus der Datei bleibt erhalten, nur der Zusatz kommt dazu.
        $this->assertSame(["Titel", "Titel (2)", "titel (3)"], TableHeader::dedupe(["Titel", "Titel", "titel"]));
    }

    public function testNamenloseSpalteBekommtPlatzhalter()
    {
        $this->assertSame(["Titel", "Spalte 2"], TableHeader::dedupe(["Titel", "  "]));
    }

    public function testLiestKopfzeileUndStichprobe()
    {
        $h = TableHeader::read(AVEFI_SAMPLES . "/films.csv", "csv");
        $this->assertSame(12, count($h["columns"]));
        $this->assertSame("title", $h["columns"][0]);
        $this->assertSame(3, $h["row_count"]);
        $this->assertSame("Metropolis", $h["rows"][0]["title"]);
        $this->assertSame(32, strlen($h["hash"]));
    }

    /* ==================== Transform ==================== */

    public function testLaufzeitWirdSchemakonform()
    {
        // Das Schema verlangt PT[hh]H[mm]M[ss]S mit mindestens zweistelligen Werten;
        // einstellige Angaben sind nicht konform (Thema aus dem Termin vom 18.08.).
        $e = [];
        $this->assertSame("PT02H33M00S", Transform::toIsoDuration("153", "minutes", $e));
        $this->assertSame("PT00H10M00S", Transform::toIsoDuration("10", "minutes", $e));
        $this->assertSame("PT01H30M45S", Transform::toIsoDuration("1:30:45", "auto", $e));
        $this->assertSame("PT00H05M30S", Transform::toIsoDuration("5:30", "auto", $e));
        $this->assertSame([], $e);
    }

    public function testEinstelligesPtWirdNormalisiert()
    {
        $e = [];
        $this->assertSame("PT01H05M00S", Transform::toIsoDuration("PT1H5M", "auto", $e));
        $this->assertSame("PT02H33M00S", Transform::toIsoDuration("PT02H33M00S", "auto", $e));   // schon konform
    }

    public function testDatumNachIso()
    {
        $e = [];
        $this->assertSame("1961-03-12", Transform::toIsoDate("12.03.1961", "", $e));
        $this->assertSame("1961-03", Transform::toIsoDate("3.1961", "", $e));
        $this->assertSame("1961", Transform::toIsoDate("um 1961", "", $e));
        $this->assertSame("1961-03-12", Transform::toIsoDate("1961-03-12", "", $e));
    }

    public function testUnlesbaresDatumWirdBeanstandet()
    {
        $e = [];
        $this->assertSame("", Transform::toIsoDate("keine Angabe", "", $e));
        $this->assertNotEmpty($e);
    }

    public function testKetteTrimUndSplit()
    {
        $r = Transform::run([["op" => "trim"], ["op" => "split", "sep" => ";"]], " Lang; Murnau ; ");
        $this->assertSame(["Lang", "Murnau"], $r["value"]);
    }

    public function testConcatGreiftAufDieZeileZu()
    {
        $r = Transform::run([["op" => "concat", "columns" => ["Nachname"], "sep" => " "]],
            "Fritz", ["row" => ["Vorname" => "Fritz", "Nachname" => "Lang"]]);
        $this->assertSame("Fritz Lang", $r["value"]);
    }

    public function testValuemapBehaeltUnbekanntesAlsNotiz()
    {
        $r = Transform::run([["op" => "valuemap", "map" => ["s/w" => "BlackAndWhite"], "fallback" => "keep_note"]], "teilweise koloriert");
        $this->assertSame("", $r["value"]);
        $this->assertSame(["teilweise koloriert"], $r["notes"]);
    }

    public function testValuemapKannBeanstanden()
    {
        $r = Transform::run([["op" => "valuemap", "map" => [], "fallback" => "error"]], "unbekannt");
        $this->assertNotEmpty($r["errors"]);
    }

    public function testKettentypWirdOhneAusfuehrungBestimmt()
    {
        $this->assertSame("list", Transform::chainType([["op" => "split", "sep" => ";"]], "text")["type"]);
        $this->assertSame("text", Transform::chainType([["op" => "split", "sep" => ";"], ["op" => "join"]], "text")["type"]);
        $this->assertSame("number", Transform::chainType([["op" => "number"]], "text")["type"]);
    }

    public function testKettentypMeldetUnpassendenSchritt()
    {
        // „join" erwartet eine Liste, bekommt aber einen Einzelwert.
        $res = Transform::chainType([["op" => "join"]], "text");
        $this->assertNotEmpty($res["errors"]);
    }

    /* ==================== TargetCatalog ==================== */

    public function testKatalogKenntKernziele()
    {
        foreach (["work.title.primary", "work.production.date", "work.activity.directing",
                  "item.duration", "item.colour_type", "item.identifier.local"] as $k) {
            $this->assertTrue(TargetCatalog::exists($k), "Ziel fehlt: {$k}");
        }
    }

    public function testEnumWertWirdGeprueft()
    {
        $t = TargetCatalog::get("item.colour_type");
        $this->assertSame([], TargetCatalog::validateValue($t, "BlackAndWhite"));
        $this->assertNotEmpty(TargetCatalog::validateValue($t, "schwarzweiss"));
    }

    public function testLaufzeitFormatWirdGeprueft()
    {
        $t = TargetCatalog::get("item.duration");
        $this->assertSame([], TargetCatalog::validateValue($t, "PT01H30M00S"));
        $this->assertNotEmpty(TargetCatalog::validateValue($t, "PT1H30M0S"));
        $this->assertNotEmpty(TargetCatalog::validateValue($t, "90"));
    }

    public function testFrontendKatalogLiefertEnumwerte()
    {
        $rows = TargetCatalog::forFrontend();
        $this->assertNotEmpty($rows);
        $colour = null;
        foreach ($rows as $r) if ($r["key"] === "item.colour_type") $colour = $r;
        $this->assertNotNull($colour);
        $this->assertContains("BlackAndWhite", $colour["enum"]);
    }

    /* ==================== MappingRunner ==================== */

    private function mapping(): array
    {
        return [
            "version" => 1,
            "columns" => [
                "title"        => ["pre" => [["op" => "trim"]], "targets" => [["target" => "work.title.primary"]]],
                "year"         => ["pre" => [], "targets" => [["target" => "work.production.date", "post" => [["op" => "year"]]]]],
                "director"     => ["pre" => [], "targets" => [["target" => "work.activity.directing", "post" => [["op" => "split", "sep" => ";"]]]]],
                "duration_min" => ["pre" => [], "targets" => [["target" => "item.duration", "post" => [["op" => "duration", "unit" => "minutes"]]]]],
                "signature"    => ["pre" => [], "targets" => [["target" => "item.identifier.local"]]],
                "language"     => ["ignore" => true],
            ],
            "defaults" => [["target" => "work.type", "value" => "Monographic"]],
            "grouping" => ["work" => ["by" => []]],
        ];
    }

    public function testZeileWirdZuGueltigemAvefi()
    {
        $runner = new MappingRunner($this->mapping());
        $row = ["title" => " Metropolis ", "year" => "1927", "director" => "Fritz Lang",
                "duration_min" => "153", "signature" => "DFI-1927-001", "language" => "Stumm"];
        $r = $runner->runRow($row, "t1");
        $c = $r["canonical"];

        $this->assertSame("Metropolis", $c["work"]["has_primary_title"]["has_name"]);
        $this->assertSame("1927", $c["work"]["has_event"][0]["has_date"]);
        $this->assertSame("Fritz Lang", $c["work"]["has_event"][0]["has_activity"][0]["has_agent"][0]["has_name"]);
        $this->assertSame("PT02H33M00S", $c["items"][0]["has_duration"]["has_value"]);
        // Eine gemappte lokale Kennung dient zugleich als Verknüpfungs-ID.
        $this->assertSame("DFI-1927-001", $c["items"][0]["has_identifier"][0]["id"]);

        foreach (AvefiMapper::validateSet(AvefiMapper::flatten($c)) as $v) {
            $this->assertSame([], $v["errors"], $v["class"] . ": " . implode(" / ", $v["errors"]));
        }
    }

    public function testIgnorierteSpalteErzeugtNichts()
    {
        $runner = new MappingRunner($this->mapping());
        $r = $runner->runRow(["title" => "X", "language" => "Stumm"], "t1");
        $this->assertArrayNotHasKey("language", $r["cells"]);
    }

    public function testFestwertFuelltLuecke()
    {
        $runner = new MappingRunner($this->mapping());
        $r = $runner->runRow(["title" => "X"], "t1");
        $this->assertSame("Monographic", $r["canonical"]["work"]["type"]);
    }

    public function testExemplarBekommtImmerEineFassung()
    {
        // Ein Item braucht laut Schema is_item_of — die Fassung entsteht deshalb
        // auch dann, wenn ihr keine Spalte zugeordnet ist.
        $runner = new MappingRunner($this->mapping());
        $c = $runner->runRow(["title" => "X", "signature" => "S-1"], "t1")["canonical"];
        $this->assertCount(1, $c["manifestations"]);
        $this->assertSame($c["manifestations"][0]["has_identifier"][0]["id"], $c["items"][0]["is_item_of"]["id"]);
    }

    public function testWerkTitelWirdErsatzweiseUebernommen()
    {
        $m = ["columns" => ["t" => ["pre" => [], "targets" => [["target" => "item.title.primary"]]]]];
        $c = (new MappingRunner($m))->runRow(["t" => "Nur Exemplartitel"], "t1")["canonical"];
        $this->assertSame("Nur Exemplartitel", $c["work"]["has_primary_title"]["has_name"]);
        $this->assertSame("SuppliedDevisedTitle", $c["work"]["has_primary_title"]["type"]);
    }

    /* ---------- eine Spalte, mehrere Ziele ---------- */

    public function testEineSpalteBedientMehrereZieleMitEigenerKette()
    {
        // Spalte → globale Kette → je Zweig eigene Kette → eigenes Ziel.
        $m = ["columns" => ["Regie" => [
            "pre" => [["op" => "trim"]],
            "targets" => [
                ["target" => "work.activity.directing", "post" => [["op" => "split", "sep" => ";"]]],
                ["target" => "work.subject.person",     "post" => [["op" => "uppercase"]]],
            ],
        ]]];
        $r = (new MappingRunner($m))->runRow(["Regie" => "  Lang; Murnau "], "t1");
        $c = $r["canonical"];

        // Zweig 1: aufgeteilt in zwei Beteiligte
        $agents = $c["work"]["has_event"][0]["has_activity"][0]["has_agent"];
        $this->assertSame(["Lang", "Murnau"], array_column($agents, "has_name"));

        // Zweig 2: derselbe Quellwert, andere Kette, anderes Ziel
        $this->assertSame("LANG; MURNAU", $c["work"]["has_subject"][0]["has_name"]);

        // Die Vorschau muss jeden Ausgabewert seinem Zweig zuordnen können.
        $targets = array_column($r["cells"]["Regie"]["outputs"], "target");
        $this->assertContains("work.activity.directing", $targets);
        $this->assertContains("work.subject.person", $targets);
    }

    public function testGlobaleKetteGiltFuerAlleZweige()
    {
        $m = ["columns" => ["t" => [
            "pre" => [["op" => "replace", "search" => "Film: ", "with" => ""]],
            "targets" => [["target" => "work.title.primary"], ["target" => "item.title.primary"]],
        ]]];
        $c = (new MappingRunner($m))->runRow(["t" => "Film: Metropolis"], "t1")["canonical"];
        $this->assertSame("Metropolis", $c["work"]["has_primary_title"]["has_name"]);
        $this->assertSame("Metropolis", $c["items"][0]["has_primary_title"]["has_name"]);
    }

    /* ---------- statische Prüfung ---------- */

    public function testListeInEinwertigesZielIstEinNogo()
    {
        $m = ["columns" => ["t" => ["pre" => [["op" => "split", "sep" => ";"]],
                                    "targets" => [["target" => "work.title.primary"]]]]];
        $checks = (new MappingRunner($m))->staticCheck();
        $nogo = array_filter($checks, fn($c) => $c["level"] === "nogo");
        $this->assertNotEmpty($nogo);
        $this->assertTrue((new MappingRunner($m))->hasBlocker());
    }

    public function testUnbekanntesZielIstEinNogo()
    {
        $m = ["columns" => ["t" => ["pre" => [], "targets" => [["target" => "gibt.es.nicht"]]]]];
        $this->assertTrue((new MappingRunner($m))->hasBlocker());
    }

    public function testFehlenderLaufzeitkonverterWirdVorgeschlagen()
    {
        $m = ["columns" => ["d" => ["pre" => [], "targets" => [["target" => "item.duration"]]]]];
        $checks = (new MappingRunner($m))->staticCheck();
        $fix = null;
        foreach ($checks as $c) if ($c["fix"] !== null && $c["fix"]["op"] === "duration") $fix = $c;
        $this->assertNotNull($fix, "Autofix-Vorschlag für die Laufzeit fehlt");
        $this->assertSame("warn", $fix["level"]);
    }

    public function testFehlenderWerktitelIstNurEineWarnung()
    {
        $m = ["columns" => ["s" => ["pre" => [], "targets" => [["target" => "item.identifier.local"]]]]];
        $r = new MappingRunner($m);
        $this->assertFalse($r->hasBlocker());
        $msgs = array_column($r->staticCheck(), "message");
        $this->assertNotEmpty(array_filter($msgs, fn($m2) => str_contains($m2, "Haupttitel")));
    }

    /* ---------- Werkbildung ---------- */

    public function testGruppierungIstStandardmaessigAus()
    {
        $this->assertFalse((new MappingRunner($this->mapping()))->groupsWorks());
    }

    public function testGleicherTitelErgibtDenselbenSchluessel()
    {
        $m = $this->mapping();
        $m["grouping"]["work"]["by"] = ["target:work.title.primary"];
        $runner = new MappingRunner($m);

        $a = $runner->runRow(["title" => "Metropolis", "signature" => "A"], "t1");
        $b = $runner->runRow(["title" => " metropolis ", "signature" => "B"], "t2");
        $this->assertSame(
            $runner->workKey(["title" => "Metropolis"], $a["canonical"]),
            $runner->workKey(["title" => " metropolis "], $b["canonical"])
        );
    }

    public function testZusammenfuehrenHaengtExemplareAn()
    {
        $m = $this->mapping();
        $m["grouping"]["work"]["by"] = ["target:work.title.primary"];
        $runner = new MappingRunner($m);
        $a = $runner->runRow(["title" => "Metropolis", "signature" => "A"], "t1")["canonical"];
        $b = $runner->runRow(["title" => "Metropolis", "signature" => "B"], "t2")["canonical"];

        $merged = MappingRunner::merge($a, $b);
        $this->assertCount(2, $merged["items"]);
        $this->assertCount(2, $merged["manifestations"]);
        // Beide Fassungen hängen am selben Werk.
        $workId = $merged["work"]["has_identifier"][0]["id"];
        foreach ($merged["manifestations"] as $mf) {
            $this->assertSame($workId, $mf["is_manifestation_of"][0]["id"]);
        }
    }

    public function testRegelWirdImKlartextBenannt()
    {
        $m = $this->mapping();
        $m["grouping"]["work"]["by"] = ["target:work.title.primary", "column:Regie"];
        $this->assertSame("Haupttitel + Spalte „Regie“", (new MappingRunner($m))->groupingLabel());
    }

    /* ==================== MappingProfile ==================== */

    public function testProfilIstErstOhneOffeneSpaltenVollstaendig()
    {
        $m = MappingProfile::emptyMapping(["A", "B"]);
        $this->assertFalse(MappingProfile::computeComplete($m));
        $this->assertSame(["A", "B"], MappingProfile::openColumns($m));

        $m["columns"]["A"]["targets"][] = ["target" => "work.title.primary"];
        $this->assertFalse(MappingProfile::computeComplete($m));   // B ist noch unbeantwortet

        $m["columns"]["B"]["ignore"] = true;
        $this->assertTrue(MappingProfile::computeComplete($m));
        $this->assertSame([], MappingProfile::openColumns($m));
    }

    public function testUebernahmeOrdnetNachSpaltennamenZu()
    {
        $foreign = ["columns" => [
            "Titel" => ["pre" => [], "targets" => [["target" => "work.title.primary"]]],
            "Regie" => ["pre" => [], "targets" => [["target" => "work.activity.directing"]]],
        ]];
        $res = MappingProfile::adopt($foreign, ["titel", "Jahr"]);
        $this->assertSame(["titel"], $res["matched"]);
        $this->assertSame(["Jahr"], $res["missing"]);
        $this->assertSame(["regie"], $res["extra"]);
        $this->assertSame("work.title.primary", $res["mapping"]["columns"]["titel"]["targets"][0]["target"]);
    }

    /* ==================== MappingSuggest ==================== */

    public function testVorschlaegeFuerTypischeSpalten()
    {
        $expect = [
            "Titel" => "work.title.primary",
            "Produktionsjahr" => "work.production.date",
            "Regie" => "work.activity.directing",
            "Signatur" => "item.identifier.local",
            "Color" => "item.colour_type",
            "Länge" => "item.duration",
        ];
        foreach ($expect as $col => $target) {
            $s = MappingSuggest::forColumn($col);
            $this->assertNotEmpty($s, "kein Vorschlag für {$col}");
            $this->assertSame($target, $s[0]["target"], "falscher Vorschlag für {$col}");
        }
    }

    public function testKeineTrefferInDerWortmitte()
    {
        // Regression: die alte Heuristik verglich mit str_contains, dadurch traf
        // „min" in „Administration"/„Termin", „sign" in „Design", „land" in „Landkreis".
        foreach (["Administration", "Termin", "Design", "Bestandsverwaltung"] as $col) {
            foreach (MappingSuggest::forColumn($col) as $s) {
                $this->assertNotSame("item.duration", $s["target"], "{$col} → Laufzeit");
                $this->assertNotSame("item.identifier.local", $s["target"], "{$col} → Signatur");
            }
        }
    }

    public function testVokabularkandidatenNurBeiWenigenWerten()
    {
        $distinct = [
            "Farbe" => ["Farbe" => 30, "s/w" => 12],
            "Titel" => array_fill_keys(range("a", "z"), 1),
        ];
        $c = MappingSuggest::vocabularyCandidates($distinct);
        $this->assertArrayHasKey("Farbe", $c);
        $this->assertArrayNotHasKey("Titel", $c);
        $this->assertSame(["Farbe", "s/w"], $c["Farbe"]);
    }
}
