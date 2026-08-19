<?php

/*
 * MappingPreviewTest — die Auswahl der Beispiele. Anlass war ein Fehlbild im
 * Editor: Die Vorschau hing an Zeile 1, und in der Paderborner Liste ist dort das
 * Produktionsjahr leer (Regie sogar in den ersten drei Zeilen). Es sah aus, als sei
 * die Zuordnung kaputt, obwohl sie stimmte.
 */
class MappingPreviewTest extends \Codeception\Test\Unit
{
    protected $tester;

    private function rows(): array
    {
        // Nachbau der Eigenheiten der echten Datei: vorne Lücken, Wiederholungen,
        // eine durchgehend leere Spalte.
        return [
            ["Titel" => "Sicherheit im Haushalt", "Jahr" => "",     "Regie" => "",               "Farbe" => "Farbe", "Leer" => ""],
            ["Titel" => "Grönland",               "Jahr" => "1953", "Regie" => "",               "Farbe" => "s/w",   "Leer" => ""],
            ["Titel" => "Kakao",                  "Jahr" => "1956", "Regie" => "",               "Farbe" => "s/w",   "Leer" => ""],
            ["Titel" => "Quick",                  "Jahr" => "1951", "Regie" => "Heinz Sielmann", "Farbe" => "s/w",   "Leer" => ""],
            ["Titel" => "Reinecke",               "Jahr" => "1953", "Regie" => "Heinz Sielmann", "Farbe" => "s/w",   "Leer" => ""],
            ["Titel" => "Karl",                   "Jahr" => "1952", "Regie" => "H. A. Lettow",   "Farbe" => "s/w",   "Leer" => ""],
        ];
    }

    private function columns(): array
    {
        return ["Titel", "Jahr", "Regie", "Farbe", "Leer"];
    }

    /* ---------- Auswahl der Beispiele ---------- */

    public function testUeberspringtLeereZeilenAmAnfang()
    {
        $p = MappingPreview::pickExamples($this->columns(), $this->rows());
        $this->assertSame(["1953", "1956", "1951"], array_column($p["Jahr"]["examples"], "raw"));
        $this->assertSame(["Heinz Sielmann", "H. A. Lettow"], array_column($p["Regie"]["examples"], "raw"));
    }

    public function testMerktSichDieZeilennummer()
    {
        $p = MappingPreview::pickExamples($this->columns(), $this->rows());
        // 0-basiert: „1953" steht in der zweiten Datenzeile.
        $this->assertSame(1, $p["Jahr"]["examples"][0]["row"]);
        $this->assertSame(3, $p["Regie"]["examples"][0]["row"]);
    }

    public function testNurVerschiedeneWerteMitHaeufigkeit()
    {
        // „s/w" steht fünfmal — als ein Beispiel mit Anzahl, nicht fünfmal.
        $p = MappingPreview::pickExamples($this->columns(), $this->rows());
        $this->assertSame(["Farbe", "s/w"], array_column($p["Farbe"]["examples"], "raw"));
        $this->assertSame([1, 5], array_column($p["Farbe"]["examples"], "count"));
    }

    public function testHaeufigkeitZaehltUeberDasLimitHinaus()
    {
        $rows = [];
        for ($i = 0; $i < 20; $i++) $rows[] = ["A" => "x"];
        $rows[] = ["A" => "y"];
        $p = MappingPreview::pickExamples(["A"], $rows);
        $this->assertSame(20, $p["A"]["examples"][0]["count"]);
        $this->assertSame(21, $p["A"]["filled"]);
    }

    public function testHoechstensDreiBeispiele()
    {
        $rows = [];
        foreach (["a", "b", "c", "d", "e"] as $v) $rows[] = ["A" => $v];
        $p = MappingPreview::pickExamples(["A"], $rows);
        $this->assertCount(3, $p["A"]["examples"]);
    }

    public function testZaehltGefuellteZeilen()
    {
        $p = MappingPreview::pickExamples($this->columns(), $this->rows());
        $this->assertSame(5, $p["Jahr"]["filled"]);
        $this->assertSame(3, $p["Regie"]["filled"]);
        $this->assertSame(6, $p["Titel"]["filled"]);
        $this->assertSame(0, $p["Leer"]["filled"]);
        $this->assertSame([], $p["Leer"]["examples"]);
    }

    /* ---------- vollständige Vorschau ---------- */

    private function mapping(): array
    {
        return ["columns" => [
            "Titel" => ["pre" => [["op" => "trim"]], "targets" => [["target" => "work.title.primary"]]],
            "Jahr"  => ["pre" => [], "targets" => [["target" => "work.production.date", "post" => [["op" => "year"]]]]],
            "Regie" => ["pre" => [], "targets" => [["target" => "work.activity.directing"]]],
            "Farbe" => ["pre" => [], "targets" => [["target" => "item.colour_type",
                "post" => [["op" => "valuemap", "map" => ["Farbe" => "Colour", "s/w" => "BlackAndWhite"], "fallback" => "keep_note"]]]]],
            "Leer"  => ["ignore" => true],
        ]];
    }

    public function testVorschauLiefertErgebnisseZuDenBeispielen()
    {
        $res = MappingPreview::build(
            ["columns" => $this->columns(), "rows" => $this->rows(), "row_count" => 6],
            $this->mapping()
        );

        $jahr = $res["columns"]["Jahr"]["examples"];
        $this->assertSame("1953", $jahr[0]["raw"]);
        $this->assertSame("1953", $jahr[0]["outputs"][0]["value"]);
        $this->assertSame("work.production.date", $jahr[0]["outputs"][0]["target"]);

        $farbe = $res["columns"]["Farbe"]["examples"];
        $this->assertSame("Colour", $farbe[0]["outputs"][0]["value"]);
        $this->assertSame("BlackAndWhite", $farbe[1]["outputs"][0]["value"]);
    }

    public function testBelegungWirdMitgeliefert()
    {
        $res = MappingPreview::build(
            ["columns" => $this->columns(), "rows" => $this->rows(), "row_count" => 77],
            $this->mapping()
        );
        $this->assertSame(3, $res["columns"]["Regie"]["filled"]["n"]);
        $this->assertSame(6, $res["columns"]["Regie"]["filled"]["of"]);
        $this->assertSame(77, $res["columns"]["Regie"]["filled"]["total"]);
    }

    public function testStrukturvorschauKommtAusDerErstenZeile()
    {
        // Der AVefi-Baum soll einen echten Datensatz zeigen, nicht Bruchstücke aus
        // verschiedenen Zeilen — deshalb ist Zeile 1 immer unter den gerechneten.
        $res = MappingPreview::build(
            ["columns" => $this->columns(), "rows" => $this->rows(), "row_count" => 6],
            $this->mapping()
        );
        $this->assertSame("Sicherheit im Haushalt", $res["canonical"]["work"]["has_primary_title"]["has_name"]);
    }

    public function testRechnetNurDieBenoetigtenZeilen()
    {
        $res = MappingPreview::build(
            ["columns" => $this->columns(), "rows" => $this->rows(), "row_count" => 6],
            $this->mapping()
        );
        // Zeile 1 (Struktur) + die Zeilen der Beispiele — nicht alle sechs zwingend.
        $this->assertGreaterThan(0, $res["evaluatedRows"]);
        $this->assertLessThanOrEqual(6, $res["evaluatedRows"]);
    }

    public function testDeckelBegrenztDieRechenarbeit()
    {
        $rows = [];
        for ($i = 0; $i < 500; $i++) $rows[] = ["A" => "wert" . $i];
        $res = MappingPreview::build(["columns" => ["A"], "rows" => $rows, "row_count" => 500],
            ["columns" => ["A" => ["pre" => [], "targets" => [["target" => "work.title.primary"]]]]], 5);
        $this->assertLessThanOrEqual(5, $res["evaluatedRows"]);
    }

    public function testSchemaBeanstandungenWerdenEntdoppeltUndGezaehlt()
    {
        // Farbe ohne Werteliste: „Farbe" und „s/w" sind keine gültigen Enum-Werte,
        // die Beanstandung muss über alle geprüften Zeilen zusammengefasst erscheinen.
        $m = ["columns" => [
            "Titel" => ["pre" => [], "targets" => [["target" => "work.title.primary"]]],
            "Farbe" => ["pre" => [], "targets" => [["target" => "item.colour_type"]]],
        ]];
        $res = MappingPreview::build(
            ["columns" => $this->columns(), "rows" => $this->rows(), "row_count" => 6], $m);

        // Der unzulässige Wert wird schon vor dem Schema abgefangen (Zielprüfung),
        // deshalb steht er als Fehler am Beispiel — nicht als Schema-Beanstandung.
        $farbe = $res["columns"]["Farbe"]["examples"];
        $this->assertNotEmpty($farbe[0]["errors"]);
        $this->assertStringContainsString("Farbe", $farbe[0]["errors"][0]);
    }
}
