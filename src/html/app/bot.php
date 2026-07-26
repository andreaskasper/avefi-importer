#!/usr/bin/env php
<?php
/*
 * AVefi Importer — CLI-Worker / Bot-Runner.
 * Aufruf: php app/bot.php -t <botname> [--id N] [--sleep S] [-r]
 * Bots liegen in app/code/classes/bots/ (Namespace \bots).
 */

declare(strict_types=1);

define("avefi_entrypoint", true);
error_reporting(E_ALL);

$_ENV["basepath"] = dirname(__DIR__);

$_ENV["args"] = getopt("t:r::h", ["debug::", "id::", "sleep::", "help"]);
if (isset($_ENV["args"]["help"])) {
	echo "AVefi Importer Worker\n  -t <bot>   auszuführender Bot\n  --id N     optionale Datensatz-ID\n  --sleep S  Sekunden Pause je Durchlauf\n  -r         Endlosschleife\n";
	exit;
}

spl_autoload_register(function ($class_name) {
	$file = __DIR__ . "/code/classes/" . str_replace("\\", "/", $class_name) . ".php";
	if (file_exists($file)) { require $file; return true; }
	return false;
});

$vendor = __DIR__ . "/code/vendor/autoload.php";
if (file_exists($vendor)) require_once $vendor;

date_default_timezone_set("Europe/Berlin");

DB::init();

if (empty($_ENV["args"]["t"])) {
	echo "Der Parameter -t fehlt.\nVerfügbare Bots:\n";
	$dir = $_ENV["basepath"] . "/app/code/classes/bots/";
	foreach (is_dir($dir) ? scandir($dir) : [] as $file) {
		if (str_starts_with($file, ".")) continue;
		if (!str_ends_with($file, ".php")) continue;
		echo "  [*] " . substr($file, 0, -4) . "\n";
	}
	exit;
}

$bot = $_ENV["args"]["t"];

while (true) {
	echo "[*] starte Bot: {$bot}\n";
	if (!class_exists("\\bots\\" . $bot)) {
		echo "[\033[0;31mERROR\033[0m] Der Bot \033[1;34m{$bot}\033[0m existiert nicht.\n";
		exit(1);
	}

	$atts = [];
	if (!empty($_ENV["args"]["id"])) $atts["id"] = $_ENV["args"]["id"];
	call_user_func(["\\bots\\" . $bot, "run"], $atts);
	echo "[*] fertig: {$bot}    RAM: " . round(memory_get_usage(true) / 1048576, 1) . " MB\n";

	if (!empty($_ENV["args"]["sleep"])) {
		$s = (int)$_ENV["args"]["sleep"];
		echo "sleep {$s}s\n";
		sleep($s);
	}

	if (isset($_ENV["args"]["r"])) continue;
	break;
}
