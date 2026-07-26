<?php

class PhpTest extends \Codeception\Test\Unit
{
    protected $tester;

    /**
     * @dataProvider requiredExtensions
     */
    public function testExtensionLoaded($ext)
    {
        $this->assertTrue(extension_loaded($ext), "PHP-Erweiterung „" . $ext . "\" fehlt");
    }

    public static function requiredExtensions(): array
    {
        return [
            "json"      => ["json"],
            "mbstring"  => ["mbstring"],
            "dom"       => ["dom"],
            "xmlreader" => ["xmlreader"],
            "pdo"       => ["pdo"],
            "pdo_pgsql" => ["pdo_pgsql"],
        ];
    }

    public function testArgon2OrDefaultHashAvailable()
    {
        $this->assertTrue(defined("PASSWORD_ARGON2ID") || defined("PASSWORD_DEFAULT"), "Kein geeigneter Passwort-Hash-Algorithmus");
    }

    public function testSchemaFileExists()
    {
        $this->assertFileExists(AVEFI_ROOT . "/src/html/schema/avefi-record.schema.json");
    }
}
