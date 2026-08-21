<?php

/*
 * AuthorityEnrichTest — der von Jonas Pitz am 20.08.2026 gemeldete Fehler:
 * Beim Nachschlagen von Normdaten für Regisseure wurde der Name durch die GND-ID
 * ersetzt („has_name": "1337928623"), statt die ID als same_as zu ergänzen.
 *
 * Ursache war die Bauform des Konverters: „authority" gab die ID als neuen Wert
 * zurück, und der Wert landet an dem Ziel, an dem die Kette hängt. An einem
 * Namensfeld überschrieb die ID damit den Namen.
 */
class AuthorityEnrichTest extends \Codeception\Test\Unit
{
    protected $tester;

    /** Ein Treffer, wie ihn der authority-Konverter über den Nebenkanal meldet. */
    private function hit(string $value, string $id = "1337928623", string $res = "GNDResource"): array
    {
        return ["value" => $value, "category" => "avefi:" . $res, "id" => $id, "resource" => $res];
    }

    public function testNameBleibtErhaltenUndIdKommtAlsSameAs()
    {
        $b = new AvefiBuilder();
        $b->write(TargetCatalog::get("work.activity.directing"), "Heinz Sielmann", [$this->hit("Heinz Sielmann")]);
        $c = $b->build("t1");

        $agent = $c["work"]["has_event"][0]["has_activity"][0]["has_agent"][0];
        $this->assertSame("Heinz Sielmann", $agent["has_name"], "Der Name darf nicht überschrieben werden");
        $this->assertSame([["category" => "avefi:GNDResource", "id" => "1337928623"]], $agent["same_as"]);
    }

    public function testErgebnisBleibtSchemagueltig()
    {
        $b = new AvefiBuilder();
        $b->write(TargetCatalog::get("work.title.primary"), "Quick, das Eichhörnchen");
        $b->write(TargetCatalog::get("work.activity.directing"), "Heinz Sielmann", [$this->hit("Heinz Sielmann")]);
        foreach (AvefiMapper::validateSet(AvefiMapper::flatten($b->build("t1"))) as $v) {
            $this->assertSame([], $v["errors"], $v["class"] . ": " . implode(" / ", $v["errors"]));
        }
    }

    public function testSchlagwortUndOrtBekommenEbenfallsSameAs()
    {
        $b = new AvefiBuilder();
        $b->write(TargetCatalog::get("work.subject.topic"), "Tierfilm", [$this->hit("Tierfilm", "4060087-7")]);
        $b->write(TargetCatalog::get("work.subject.place"), "Berlin", [$this->hit("Berlin", "4005728-8")]);
        $c = $b->build("t1");

        $subjects = $c["work"]["has_subject"];
        $this->assertSame("4060087-7", $subjects[0]["same_as"][0]["id"]);
        $this->assertSame("4005728-8", $subjects[1]["same_as"][0]["id"]);
    }

    public function testUnzulaessigeQuelleWirdNichtAngehaengt()
    {
        // Genre erlaubt laut Schema nur GND — eine Wikidata-ID gehört dort nicht hin.
        $b = new AvefiBuilder();
        $b->write(TargetCatalog::get("work.genre"), "Dokumentarfilm",
            [$this->hit("Dokumentarfilm", "Q93204", "WikidataResource")]);
        $genre = $b->build("t1")["work"]["has_genre"][0];
        $this->assertSame("Dokumentarfilm", $genre["has_name"]);
        $this->assertArrayNotHasKey("same_as", $genre);
    }

    public function testBeiKennungszielIstDieIdDerWert()
    {
        // Hier ist die ID die eigentliche Angabe — der Name wäre schemawidrig.
        $b = new AvefiBuilder();
        $errors = $b->write(TargetCatalog::get("work.same_as.gnd"), "Heinz Sielmann", [$this->hit("Heinz Sielmann")]);
        $this->assertSame([], $errors);
        $this->assertSame([["category" => "avefi:GNDResource", "id" => "1337928623"]], $b->build("t1")["work"]["same_as"]);
    }

    public function testOhneTrefferBleibtDerNameStehen()
    {
        $b = new AvefiBuilder();
        $b->write(TargetCatalog::get("work.activity.directing"), "Unbekannte Person", []);
        $agent = $b->build("t1")["work"]["has_event"][0]["has_activity"][0]["has_agent"][0];
        $this->assertSame("Unbekannte Person", $agent["has_name"]);
        $this->assertArrayNotHasKey("same_as", $agent);
    }

    public function testDerselbePersonWirdNichtDoppeltAngelegt()
    {
        $b = new AvefiBuilder();
        $t = TargetCatalog::get("work.activity.directing");
        $b->write($t, "Heinz Sielmann", []);
        $b->write($t, "Heinz Sielmann", [$this->hit("Heinz Sielmann")]);   // ID kommt später dazu
        $agents = $b->build("t1")["work"]["has_event"][0]["has_activity"][0]["has_agent"];
        $this->assertCount(1, $agents);
        $this->assertSame("1337928623", $agents[0]["same_as"][0]["id"]);
    }

    public function testKetteMeldetTrefferUeberDenNebenkanal()
    {
        // Ohne Netz: Transform::run liefert den Wert unverändert zurück; der
        // Nebenkanal bleibt leer, weil kein Treffer aufgelöst werden kann.
        $r = Transform::run([["op" => "trim"]], "  Heinz Sielmann ");
        $this->assertSame("Heinz Sielmann", $r["value"]);
        $this->assertArrayHasKey("enrich", $r);
        $this->assertSame([], $r["enrich"]);
    }

    public function testWarnungBeiUngeeignetemZiel()
    {
        $m = ["columns" => ["T" => ["pre" => [],
            "targets" => [["target" => "work.title.primary",
                           "post" => [["op" => "authority", "source" => "gnd", "kind" => "person"]]]]]]];
        $runner = new MappingRunner($m);
        $this->assertFalse($runner->hasBlocker());
        $msgs = array_column($runner->staticCheck(), "message");
        $this->assertNotEmpty(array_filter($msgs, fn($x) => str_contains($x, "Normdaten nachschlagen")));
    }

    public function testGeeigneteZieleWerdenNichtBeanstandet()
    {
        foreach (["work.activity.directing", "work.subject.topic", "work.subject.place",
                  "work.genre", "work.same_as.gnd"] as $key) {
            $this->assertTrue(AvefiBuilder::acceptsAuthority(TargetCatalog::get($key)), $key);
        }
        $this->assertFalse(AvefiBuilder::acceptsAuthority(TargetCatalog::get("work.title.primary")));
        $this->assertFalse(AvefiBuilder::acceptsAuthority(TargetCatalog::get("item.duration")));
    }
}
