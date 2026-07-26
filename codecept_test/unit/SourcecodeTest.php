<?php

class SourcecodeTest extends \Codeception\Test\Unit
{
    protected $tester;

    /**
     * @dataProvider phpFiles
     */
    public function testPhpSyntax($file)
    {
        $out = [];
        $code = 0;
        exec("php -l " . escapeshellarg($file) . " 2>&1", $out, $code);
        $this->assertSame(0, $code, "Syntaxfehler in " . $file . ": " . implode(" ", $out));
    }

    /**
     * @dataProvider jsonFiles
     */
    public function testJsonValid($file)
    {
        $this->assertNotNull(json_decode((string)file_get_contents($file)), "Ungültiges JSON: " . $file);
    }

    public static function phpFiles(): array
    {
        $out = [];
        foreach (self::rglob(AVEFI_ROOT . "/src/html", "php") as $f) {
            if (str_contains($f, "/vendor/")) continue;
            $out[substr($f, strlen(AVEFI_ROOT) + 1)] = [$f];
        }
        return $out;
    }

    public static function jsonFiles(): array
    {
        $out = [];
        $dirs = [AVEFI_ROOT . "/src/html/schema", AVEFI_ROOT . "/samples", AVEFI_ROOT . "/src/html/app/code"];
        foreach ($dirs as $dir) {
            foreach (self::rglob($dir, "json") as $f) {
                if (str_contains($f, "/vendor/")) continue;
                $out[substr($f, strlen(AVEFI_ROOT) + 1)] = [$f];
            }
        }
        return $out;
    }

    /** @return string[] */
    private static function rglob(string $dir, string $ext): array
    {
        $out = [];
        if (!is_dir($dir)) return $out;
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->isFile() && strtolower($f->getExtension()) === $ext) $out[] = $f->getPathname();
        }
        return $out;
    }
}
