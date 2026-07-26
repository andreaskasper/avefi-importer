<?php
/*
 * AVefi Importer — Front-Controller.
 * Einstiegspunkt für alle Web-Requests (siehe .htaccess: alles wird hierher geroutet).
 *
 * Interims-Domain: avefiimporter.goo1.de   ·   Ziel: import.av-efi.net
 */

declare(strict_types=1);

header("Cache-Control: no-cache, no-store, must-revalidate");

define("avefi_entrypoint", true);

$_ENV["basepath"] = __DIR__;
$_ENV["app_host"] = getenv("APP_HOST") ?: "avefiimporter.goo1.de";
$_ENV["app_env"]  = getenv("APP_ENV")  ?: "dev";

/* ---- Fehlerbehandlung ---- */
if ($_ENV["app_env"] === "dev" || isset($_COOKIE["development"])) {
	error_reporting(E_ALL);
	ini_set("display_errors", "1");
} else {
	ini_set("display_errors", "0");
	set_exception_handler(function (\Throwable $ex) {
		$logdir = __DIR__ . "/files/logs";
		if (!is_dir($logdir)) @mkdir($logdir, 0775, true);
		@file_put_contents(
			$logdir . "/exception.log",
			date("Y-m-d H:i:s") . " " . $ex->getMessage() . " @ " . $ex->getFile() . ":" . $ex->getLine() . PHP_EOL,
			FILE_APPEND
		);
		header(($_SERVER["SERVER_PROTOCOL"] ?? "HTTP/1.1") . " 500 Internal Server Error");
		die("Ein unerwarteter Fehler ist aufgetreten. Das Team wurde informiert.");
	});
}

/*
 * Klassen-Autoloader: Klassenname (inkl. Namespace) → app/code/classes/<Pfad>.php
 * Beispiel: \bots\seed → app/code/classes/bots/seed.php, \API\Auth → app/code/classes/API/Auth.php
 */
spl_autoload_register(function ($class_name) {
	$file = __DIR__ . "/app/code/classes/" . str_replace("\\", "/", $class_name) . ".php";
	if (file_exists($file)) { require $file; return true; }
	return false;
});

/* Composer-Abhängigkeiten (erst nach `composer install` vorhanden) */
$vendor = __DIR__ . "/app/code/vendor/autoload.php";
if (file_exists($vendor)) require_once $vendor;

date_default_timezone_set("Europe/Berlin");

/* ---- Datenbank (PostgreSQL) ---- */
DB::init();

/* ---- Session ---- */
session_name("avefi");
session_start();

/* ---- Dispatch ---- */
Routing::start();


/* ------------------------------------------------------------------ */
/* View-Helfer                                                         */
/* ------------------------------------------------------------------ */

function html($txt): string {
	if ($txt === null) return "";
	return htmlentities((string)$txt, ENT_QUOTES, "UTF-8");
}

function htmlattr($txt): string {
	return str_replace('"', "", html($txt));
}

function print_pre($obj): void {
	echo "<pre>";
	print_r($obj);
	echo "</pre>";
}
