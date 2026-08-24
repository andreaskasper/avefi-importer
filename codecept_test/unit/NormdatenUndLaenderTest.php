<?php

/*
 * NormdatenUndLaenderTest — die Punkte aus Luca Wollnys Testbericht vom 24.08.2026.
 *
 * Kern war ein Fehler im GND-Abgleich: Die GND führt Personen als „Sielmann, Heinz",
 * verglichen wurde gegen „Heinz Sielmann". Ein Zeichenvergleich trifft damit nie —
 * GND-Personen blieben praktisch immer ohne ID, während Körperschaften und Orte
 * (dort steht die natürliche Form) trafen. Genau dieses Muster hatte Luca beobachtet.
 */
class NormdatenUndLaenderTest extends \Codeception\Test\Unit
{
    protected $tester;

    /* ---------- Namensabgleich ---------- */

    public function testInvertierteFormWirdMitverglichen()
    {
        $formen = AuthorityLookup::comparableForms("Sielmann, Heinz");
        $this->assertContains("sielmann, heinz", $formen);
        $this->assertContains("heinz sielmann", $formen);
    }

    public function testNatuerlicheFormBleibtUnveraendert()
    {
        $this->assertSame(["hessischer rundfunk"], AuthorityLookup::comparableForms("Hessischer Rundfunk"));
    }

    public function testMehrereKommataWerdenNichtGedreht()
    {
        // „Trujilo, Marisol, Talavera" ist kein Nachname-Vorname-Paar.
        $this->assertCount(1, AuthorityLookup::comparableForms("Trujilo, Marisol, Talavera"));
    }

    public function testVergleichsformIgnoriertLeerraumUndGrossschreibung()
    {
        $this->assertSame("heinz sielmann", AuthorityLookup::compareForm("  Heinz   SIELMANN "));
    }

    /* ---------- Ländertabelle ---------- */

    public function testTabelleIstVorhanden()
    {
        $this->assertGreaterThan(200, CountryTable::size());
    }

    public function testGaengigeSchreibweisenFuehrenZumSelbenLand()
    {
        foreach (["DE", "DEU", "D", "Deutschland", "BRD", "deu"] as $v) {
            $hit = CountryTable::lookup($v);
            $this->assertNotNull($hit, "nicht erkannt: {$v}");
            $this->assertSame("Deutschland", $hit["name"], "falsch zugeordnet: {$v}");
            $this->assertSame("4011882-4", $hit["gnd"]);
        }
    }

    public function testWeitereLaenderAusDenTestdaten()
    {
        $erwartet = [
            "GRL" => "Grönland", "GHA" => "Ghana", "NLD" => "Niederlande",
            "USA" => "Vereinigte Staaten", "UK" => "Vereinigtes Königreich",
            "ITA" => "Italien", "NOR" => "Norwegen", "BGR" => "Bulgarien",
            "EGY" => "Ägypten", "CUB" => "Kuba",
        ];
        foreach ($erwartet as $code => $name) {
            $hit = CountryTable::lookup($code);
            $this->assertNotNull($hit, "nicht erkannt: {$code}");
            $this->assertSame($name, $hit["name"]);
        }
    }

    public function testUntergegangeneStaatenAusArchivlisten()
    {
        $this->assertSame("Tschechoslowakei", CountryTable::lookup("CSSR")["name"]);
        $this->assertSame("Deutsches Reich", CountryTable::lookup("DE bis 1945")["name"]);
        $this->assertSame("Sowjetunion", CountryTable::lookup("UdSSR")["name"]);
    }

    public function testUnbekanntesBleibtUnbekannt()
    {
        $this->assertNull(CountryTable::lookup("Phantasialand"));
        $this->assertNull(CountryTable::lookup(""));
    }

    public function testJedesLandHatEinenNamen()
    {
        $doc = json_decode(file_get_contents(CountryTable::path()), true);
        foreach ($doc["laender"] as $code => $e) {
            $this->assertNotEmpty($e["name"], "ohne Namen: {$code}");
        }
    }

    /* ---------- Konverter „Land" ---------- */

    public function testKonverterNormalisiertUndLiefertGnd()
    {
        $r = Transform::run([["op" => "country", "unbekannt" => "keep"]], "DE");
        $this->assertSame("Deutschland", $r["value"]);
        $this->assertSame("4011882-4", $r["enrich"][0]["id"]);
        $this->assertSame("GNDResource", $r["enrich"][0]["resource"]);
    }

    public function testKonverterArbeitetAufListen()
    {
        // „GRL/DE" wird vorher aufgeteilt — beide Teile müssen umgesetzt werden.
        $r = Transform::run([["op" => "split", "sep" => "/"], ["op" => "country", "unbekannt" => "keep"]], "GRL/DE");
        $this->assertSame(["Grönland", "Deutschland"], $r["value"]);
        $this->assertCount(2, $r["enrich"]);
    }

    public function testUnbekannteAngabeNachWahl()
    {
        $this->assertSame("Xyz", Transform::run([["op" => "country", "unbekannt" => "keep"]], "Xyz")["value"]);
        $this->assertSame("", Transform::run([["op" => "country", "unbekannt" => "drop"]], "Xyz")["value"]);
        $r = Transform::run([["op" => "country", "unbekannt" => "error"]], "Xyz");
        $this->assertNotEmpty($r["errors"]);
    }

    public function testProduktionsortBekommtDieOrtsNormdaten()
    {
        // Lucas Punkt 1.2: Am Produktionsort griff die Normdaten-Zuordnung nicht.
        $m = ["columns" => ["Land" => [
            "pre" => [["op" => "split", "sep" => "/"]],
            "targets" => [["target" => "work.production.place", "post" => [["op" => "country"]]]],
        ]]];
        $c = (new MappingRunner($m))->runRow(["Land" => "GRL/DE"], "t1")["canonical"];
        $orte = $c["work"]["has_event"][0]["located_in"];

        $this->assertSame("Grönland", $orte[0]["has_name"]);
        $this->assertSame("4022113-1", $orte[0]["same_as"][0]["id"]);
        $this->assertSame("Deutschland", $orte[1]["has_name"]);
        $this->assertTrue(AvefiBuilder::acceptsAuthority(TargetCatalog::get("work.production.place")));
    }

    /* ---------- Bestätigte Zuordnungen ---------- */

    public function testBestaetigteZuordnungSchlaegtAutomatik()
    {
        $m = ["authorities" => ["gnd" => ["heinz sielmann" => ["id" => "11861407X", "label" => "Sielmann, Heinz"]]],
              "columns" => ["Regie" => ["pre" => [], "targets" => [["target" => "work.activity.directing",
                "post" => [["op" => "authority", "source" => "gnd", "kind" => "person"]]]]]]];
        $runner = new MappingRunner($m);
        $c = $runner->runRow(["Regie" => "Heinz Sielmann"], "t1")["canonical"];

        $agent = $c["work"]["has_event"][0]["has_activity"][0]["has_agent"][0];
        $this->assertSame("Heinz Sielmann", $agent["has_name"]);
        $this->assertSame("11861407X", $agent["same_as"][0]["id"]);
        $this->assertSame(1, $runner->idOrigins()["bestaetigt"]);
        $this->assertSame(0, $runner->idOrigins()["automatisch"]);
    }

    public function testSchreibweiseDerBestaetigungIstEgal()
    {
        $m = ["authorities" => ["gnd" => ["  HEINZ   Sielmann " => ["id" => "11861407X"]]],
              "columns" => ["R" => ["pre" => [], "targets" => [["target" => "work.activity.directing",
                "post" => [["op" => "authority", "source" => "gnd"]]]]]]];
        $c = (new MappingRunner($m))->runRow(["R" => "Heinz Sielmann"], "t1")["canonical"];
        $this->assertSame("11861407X",
            $c["work"]["has_event"][0]["has_activity"][0]["has_agent"][0]["same_as"][0]["id"]);
    }

    public function testBewusstOffenGelassenTraegtNichtsEin()
    {
        $m = ["authorities" => ["gnd" => ["kirzeder" => ["id" => null]]],
              "columns" => ["R" => ["pre" => [], "targets" => [["target" => "work.activity.directing",
                "post" => [["op" => "authority", "source" => "gnd"]]]]]]];
        $agent = (new MappingRunner($m))->runRow(["R" => "Kirzeder"], "t1")
            ["canonical"]["work"]["has_event"][0]["has_activity"][0]["has_agent"][0];
        $this->assertSame("Kirzeder", $agent["has_name"]);
        $this->assertArrayNotHasKey("same_as", $agent);
    }

    /* ---------- Leere Werteliste (Lucas Punkt 3) ---------- */

    public function testLeereWertelisteWirdWeiterhinBemaengelt()
    {
        // Vorher verschwand die Warnung, sobald die Werteliste EXISTIERTE — auch leer.
        // Dann kam „kein Wert" an, und die Anzeige war trotzdem grün.
        $m = ["columns" => ["Farbe" => ["pre" => [], "targets" => [["target" => "item.colour_type",
            "post" => [["op" => "valuemap", "map" => ["Farbe" => "", "s/w" => ""]]]]]]]];
        $msgs = array_column((new MappingRunner($m))->staticCheck(), "message");
        $this->assertNotEmpty(array_filter($msgs, fn($x) => str_contains($x, "noch leer")));
    }

    public function testGefuellteWertelisteWirdNichtBemaengelt()
    {
        $m = ["columns" => ["Farbe" => ["pre" => [], "targets" => [["target" => "item.colour_type",
            "post" => [["op" => "valuemap", "map" => ["s/w" => "BlackAndWhite"]]]]]]]];
        $msgs = array_column((new MappingRunner($m))->staticCheck(), "message");
        $this->assertEmpty(array_filter($msgs, fn($x) => str_contains($x, "Werteliste")));
    }

    /* ---------- Titelvorschläge (Lucas Punkt 7) ---------- */

    public function testTitelspaltenWerdenUnterschieden()
    {
        $this->assertSame("work.title.primary", MappingSuggest::forColumn("Titel")[0]["target"]);
        $this->assertSame("work.title.primary", MappingSuggest::forColumn("Originaltitel")[0]["target"]);
        $this->assertSame("work.title.alternative", MappingSuggest::forColumn("Diverse Titel")[0]["target"]);
        $this->assertSame("work.title.alternative", MappingSuggest::forColumn("Untertitel")[0]["target"]);
    }

    /* ---------- Kernfelder ---------- */

    public function testKernfelderWerdenErkannt()
    {
        $m = ["columns" => [
            "T" => ["pre" => [], "targets" => [["target" => "work.title.primary"]]],
            "R" => ["pre" => [], "targets" => [["target" => "work.activity.directing"]]],
            "J" => ["pre" => [], "targets" => [["target" => "work.production.date", "post" => [["op" => "year"]]]]],
            "L" => ["pre" => [], "targets" => [["target" => "work.production.place"]]],
        ]];
        $runner = new MappingRunner($m);

        $voll = $runner->runRow(["T" => "Quick", "R" => "Sielmann", "J" => "1951", "L" => "DE"], "t1")["canonical"];
        $this->assertSame(["titel" => true, "regie" => true, "produktionsdatum" => true, "produktionsland" => true],
            CoreFields::presence($voll));

        $halb = $runner->runRow(["T" => "Quick", "J" => "1951"], "t2")["canonical"];
        $p = CoreFields::presence($halb);
        $this->assertTrue($p["titel"]);
        $this->assertFalse($p["regie"]);
        $this->assertTrue($p["produktionsdatum"]);
        $this->assertFalse($p["produktionsland"]);
    }

    public function testVierVonVierWirdGezaehlt()
    {
        $t = CoreFields::newTally();
        $t = CoreFields::add($t, ["work" => [
            "has_primary_title" => ["has_name" => "A"],
            "has_event" => [["category" => "avefi:ProductionEvent", "has_date" => "1951",
                             "located_in" => [["has_name" => "Deutschland"]],
                             "has_activity" => [["category" => "avefi:DirectingActivity",
                                                 "has_agent" => [["has_name" => "X"]]]]]],
        ]]);
        $t = CoreFields::add($t, ["work" => ["has_primary_title" => ["has_name" => "B"]]]);
        $t = CoreFields::finish($t);

        $this->assertSame(2, $t["records"]);
        $this->assertSame(1, $t["all_four"]);
        $this->assertSame(50, $t["all_four_percent"]);
        $this->assertSame(2, $t["fields"]["titel"]);
        $this->assertSame(1, $t["fields"]["regie"]);
        $this->assertSame(1, $t["complete"]["1"]);
        $this->assertSame(1, $t["complete"]["4"]);
    }
}
