<?php
/*
 * download-Bot — lädt eine Datei von einer URL herunter (Upload via URL),
 * legt sie unter /mnt/files/<uuid>/org/ ab und reiht einen detect-Job ein.
 *
 *   php app/bot.php -t download [-r --sleep 30]
 */

namespace bots;

class download {

	public static function run(array $atts = []): void {
		$total = 0;
		while (($job = \Job::claim("download")) !== null) {
			try {
				self::process($job);
				\Job::complete((int)$job["id"]);
				$total++;
			} catch (\Throwable $e) {
				\Job::fail((int)$job["id"], $e->getMessage());
				$id = (string)($job["import_id"] ?? "");
				if ($id !== "") { $imp = \Import::byId($id); if ($imp) $imp->setStatus("error"); }
				echo "[download] Job #{$job['id']} fehlgeschlagen: " . $e->getMessage() . "\n";
			}
		}
		echo "[download] {$total} Datei(en) geladen\n";
	}

	private static function process(array $job): void {
		$importId = (string)($job["import_id"] ?? "");
		$import   = $importId !== "" ? \Import::byId($importId) : null;
		if ($import === null) throw new \RuntimeException("Import nicht gefunden.");

		$payload = json_decode((string)($job["payload"] ?? "{}"), true) ?: [];
		$url     = (string)($payload["url"] ?? "");
		if ($url === "") throw new \RuntimeException("URL fehlt.");

		$name = \Storage::sanitizeFilename($import->filename() ?: "download");
		$dest = \Storage::prepareOrg($import->id(), $name);

		$ctx = stream_context_create(["http" => [
			"timeout"        => 60,
			"follow_location" => 1,
			"max_redirects"  => 3,
			"user_agent"     => "AVefi-Importer",
		]]);
		$src = @fopen($url, "rb", false, $ctx);
		if ($src === false) throw new \RuntimeException("Download fehlgeschlagen (nicht erreichbar).");
		$out = @fopen($dest, "wb");
		if ($out === false) { fclose($src); throw new \RuntimeException("Zieldatei nicht schreibbar."); }

		$bytes = stream_copy_to_stream($src, $out, 200 * 1024 * 1024);   // Deckel 200 MB
		fclose($src);
		fclose($out);
		if ($bytes === false || $bytes <= 0) { @unlink($dest); throw new \RuntimeException("Leere Datei erhalten."); }

		$base = self::guessFormat($dest, $name);
		$import->setFile($name, (int)$bytes, $base);
		$import->setStoragePath(\Storage::importDir($import->id()));
		$import->setStatus("queued", 100);
		\Job::enqueue("detect", $import->id());
		echo "[download] {$name} (" . round($bytes / 1024, 1) . " KB, " . ($base ?? "?") . ") → detect\n";
	}

	/** Basis-Format aus Endung, sonst aus dem Datei-Anfang raten. */
	private static function guessFormat(string $path, string $name): ?string {
		$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
		$map = ["csv" => "csv", "tsv" => "tsv", "xml" => "xml", "ead" => "ead", "marcxml" => "marcxml", "marc" => "marc", "json" => "json"];
		if (isset($map[$ext])) return $map[$ext];

		$fh = @fopen($path, "rb");
		if ($fh === false) return null;
		$head = (string)fread($fh, 512);
		fclose($fh);
		$head = ltrim($head);
		if ($head === "") return null;
		if ($head[0] === "{" || $head[0] === "[") return "json";
		if ($head[0] === "<") return "xml";
		$firstLine = strtok($head, "\r\n") ?: "";
		if (str_contains($firstLine, "\t")) return "tsv";
		if (str_contains($firstLine, ",") || str_contains($firstLine, ";")) return "csv";
		return null;
	}
}
