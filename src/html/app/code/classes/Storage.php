<?php
/*
 * Storage — Dateiablage für Uploads unter FILES_PATH (Default /mnt/files).
 * Layout pro Import:  <base>/<import-uuid>/org/<Originaldatei>
 *                     <base>/<import-uuid>/avefi.v1.json
 */

class Storage {

	public static function base(): string {
		$p = getenv("FILES_PATH");
		return rtrim(($p !== false && $p !== "") ? $p : "/mnt/files", "/");
	}

	public static function importDir(string $id): string { return self::base() . "/" . $id; }
	public static function orgDir(string $id): string     { return self::importDir($id) . "/org"; }
	public static function avefiPath(string $id, int $version = 1): string {
		return self::importDir($id) . "/avefi.v" . $version . ".json";
	}

	/** Sicheren Dateinamen ableiten: keine Pfadanteile, keine gefährlichen Zeichen. */
	public static function sanitizeFilename(string $name): string {
		$name = basename(str_replace("\\", "/", $name));       // Pfadanteile weg
		$name = preg_replace('/[^\p{L}\p{N}._-]+/u', "_", $name) ?? "";
		$name = ltrim($name, ".");                             // keine versteckten Dateien
		if ($name === "") $name = "datei";
		if (mb_strlen($name) > 180) {
			$ext  = pathinfo($name, PATHINFO_EXTENSION);
			$name = mb_substr($name, 0, 150) . ($ext !== "" ? "." . $ext : "");
		}
		return $name;
	}

	/**
	 * Verschiebt eine hochgeladene Datei nach <base>/<id>/org/<name>.
	 * @return string gespeicherter (bereinigter) Dateiname
	 */
	public static function storeOriginal(string $id, string $tmpPath, string $originalName): string {
		$dir = self::orgDir($id);
		if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
			throw new \RuntimeException("Upload-Verzeichnis konnte nicht angelegt werden (" . $dir . ").");
		}
		$name = self::sanitizeFilename($originalName);
		$dest = $dir . "/" . $name;

		if (!@move_uploaded_file($tmpPath, $dest) && !@rename($tmpPath, $dest)) {
			throw new \RuntimeException("Datei konnte nicht gespeichert werden.");
		}
		@chmod($dest, 0664);
		return $name;
	}

	/** Stellt org/ bereit und liefert den Zielpfad für einen (bereinigten) Dateinamen. */
	public static function prepareOrg(string $id, string $filename): string {
		$dir = self::orgDir($id);
		if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
			throw new \RuntimeException("Upload-Verzeichnis konnte nicht angelegt werden (" . $dir . ").");
		}
		return $dir . "/" . self::sanitizeFilename($filename);
	}

	/** Verzeichnis für abgeleitete Dateien (z. B. ein aus Excel gelöstes Blatt). */
	public static function workDir(string $id): string { return self::importDir($id) . "/work"; }

	/**
	 * Die Tabelle, mit der gearbeitet wird: das herausgelöste Blatt, falls vorhanden,
	 * sonst die Originaldatei. Der Rest der Anwendung sieht damit immer eine Tabelle,
	 * egal ob eine CSV hochgeladen oder ein Excel-Blatt gewählt wurde.
	 */
	public static function tableFile(string $id): ?string {
		$dir = self::workDir($id);
		if (is_dir($dir)) {
			foreach (scandir($dir) ?: [] as $f) {
				if ($f === "." || $f === "..") continue;
				$p = $dir . "/" . $f;
				if (is_file($p)) return $p;
			}
		}
		return self::firstOrgFile($id);
	}

	/** Stellt work/ bereit und liefert den Zielpfad. */
	public static function prepareWork(string $id, string $filename): string {
		$dir = self::workDir($id);
		if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
			throw new \RuntimeException("Arbeitsverzeichnis konnte nicht angelegt werden (" . $dir . ").");
		}
		return $dir . "/" . self::sanitizeFilename($filename);
	}

	/** Kopiert die Originaldatei eines Imports in einen anderen (für weitere Blätter). */
	public static function copyOriginal(string $fromId, string $toId): ?string {
		$src = self::firstOrgFile($fromId);
		if ($src === null) return null;
		$dest = self::prepareOrg($toId, basename($src));
		return @copy($src, $dest) ? $dest : null;
	}

	/** Pfad der (einzigen) Originaldatei im org/-Verzeichnis, oder null. */
	public static function firstOrgFile(string $id): ?string {
		$dir = self::orgDir($id);
		if (!is_dir($dir)) return null;
		foreach (scandir($dir) ?: [] as $f) {
			if ($f === "." || $f === "..") continue;
			$p = $dir . "/" . $f;
			if (is_file($p)) return $p;
		}
		return null;
	}

	/** Löscht das komplette Import-Verzeichnis rekursiv. */
	public static function deleteImport(string $id): void {
		self::rrmdir(self::importDir($id));
	}

	private static function rrmdir(string $dir): void {
		if (!is_dir($dir)) return;
		foreach (scandir($dir) ?: [] as $f) {
			if ($f === "." || $f === "..") continue;
			$p = $dir . "/" . $f;
			is_dir($p) ? self::rrmdir($p) : @unlink($p);
		}
		@rmdir($dir);
	}
}
