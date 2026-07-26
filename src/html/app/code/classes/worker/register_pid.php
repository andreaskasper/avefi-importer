<?php
/*
 * \worker\register_pid — GERÜST. Solange die PID-Registrierung nicht freigeschaltet
 * ist (PidService::isEnabled() === false), tut dieser Handler bewusst nichts.
 * Siehe handbuch/06-pid-registrierung.md.
 */

namespace worker;

class register_pid {

	public static function run(array $payload): void {
		if (!\PidService::isEnabled()) {
			return;   // deaktiviert — von AVefi freizuschalten
		}
		// TODO(AVefi): Record laden, Gültigkeit prüfen, \PidService::register(),
		//   Ergebnis in records.avefi_pid schreiben.
		throw new \RuntimeException("register_pid ist noch nicht implementiert.");
	}
}
