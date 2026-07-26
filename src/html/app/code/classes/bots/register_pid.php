<?php
/*
 * register_pid-Bot — GERÜST, noch nicht aktiv.
 *
 * Würde später `register_pid`-Jobs abarbeiten und für schema-gültige Records einen
 * AVefi-PID über PidService anfordern (Ergebnis nach records.avefi_pid). Solange die
 * PID-Registrierung nicht freigeschaltet ist (PidService::isEnabled() === false),
 * tut dieser Bot bewusst nichts. Siehe handbuch/06-pid-registrierung.md.
 */

namespace bots;

class register_pid {

	public static function run(array $atts = []): void {
		if (!\PidService::isEnabled()) {
			echo "[register_pid] PID-Registrierung ist nicht freigeschaltet — übersprungen.\n";
			return;
		}

		// TODO(AVefi): while (($job = \Job::claim("register_pid")) !== null) { … }
		//   - Record laden, Schema-Gültigkeit prüfen (SchemaValidator::isValid)
		//   - $pid = \PidService::register($recordData)
		//   - UPDATE records SET avefi_pid = $pid …
		echo "[register_pid] aktiv, aber noch nicht implementiert.\n";
	}
}
