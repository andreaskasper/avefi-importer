<?php
/*
 * Test-Bootstrap: registriert den App-Autoloader (wie html/index.php),
 * damit Unit-Tests die Projektklassen ohne laufenden Webserver nutzen können.
 */

define("AVEFI_ROOT", dirname(__DIR__));                              // /work
define("AVEFI_SAMPLES", AVEFI_ROOT . "/samples");
define("AVEFI_CLASSES", AVEFI_ROOT . "/src/html/app/code/classes");

// Composer-Abhängigkeiten (PhpSpreadsheet), falls installiert. vendor/ liegt nicht im
// Git — ohne diesen Schritt überspringen die Excel-Tests stillschweigend.
$vendor = AVEFI_ROOT . "/src/html/app/code/vendor/autoload.php";
if (is_file($vendor)) require_once $vendor;

spl_autoload_register(function ($class) {
	$file = AVEFI_CLASSES . "/" . str_replace("\\", "/", $class) . ".php";
	if (is_file($file)) require $file;
});
