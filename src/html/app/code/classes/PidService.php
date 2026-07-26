<?php
/*
 * PidService — Vergabe von AVefi-PIDs (Handle, Präfix 21.11155).
 *
 * NOCH NICHT AKTIV. Die eigentliche PID-Registrierung übernimmt AVefi später selbst;
 * diese Klasse ist bewusst nur ein Gerüst: standardmäßig deaktiviert, ruft KEINEN
 * externen Dienst auf.
 *
 * Zum Aktivieren (durch AVefi):
 *   1. PID_* Umgebungsvariablen setzen und PID_DRYRUN=false (siehe docker-compose.yml).
 *   2. register() gegen die echte Handle-/ePIC-API implementieren.
 * Siehe handbuch/06-pid-registrierung.md.
 */

class PidService {

	/** Ist die PID-Registrierung konfiguriert und aktiv? Default: false. */
	public static function isEnabled(): bool {
		$endpoint = getenv("PID_ENDPOINT");
		if ($endpoint === false || $endpoint === "") return false;
		return strtolower((string)getenv("PID_DRYRUN")) !== "true";
	}

	/** Handle-Präfix (Default 21.11155). */
	public static function prefix(): string {
		$p = getenv("PID_PREFIX");
		return ($p !== false && $p !== "") ? $p : "21.11155";
	}

	/**
	 * Registriert (später) einen PID für einen gültigen Record und liefert ihn zurück.
	 * Aktuell NICHT implementiert.
	 *
	 * @param array<string,mixed> $record interner AVefi-Record
	 * @return string|null vollständiger PID (z. B. "21.11155/abcd-1234") oder null, wenn deaktiviert
	 */
	public static function register(array $record): ?string {
		if (!self::isEnabled()) {
			return null;   // bewusst deaktiviert — von AVefi freizuschalten
		}
		// TODO(AVefi): Handle über PID_ENDPOINT anlegen/aktualisieren.
		//   - Auth:     PID_USER / PID_PASSWORD
		//   - Präfix:   self::prefix()
		//   - idempotent: vorhandenen PID nicht neu anlegen, nur Metadaten aktualisieren
		//   - Rückgabe: vollständiger PID-String
		throw new \RuntimeException("PidService::register() ist noch nicht implementiert.");
	}

	/** Auflösungs-URL zu einem PID (Handle-Resolver). */
	public static function resolveUrl(string $pid): string {
		return "https://hdl.handle.net/" . ltrim($pid, "/");
	}
}
