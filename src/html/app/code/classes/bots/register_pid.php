<?php
/*
 * register_pid — manueller/Debug-Drain für register_pid-Jobs.
 * Solange die PID-Registrierung nicht freigeschaltet ist, passiert nichts
 * (siehe \worker\register_pid und handbuch/06-pid-registrierung.md).
 *
 *   php app/bot.php -t register_pid
 */

namespace bots;

class register_pid {

	public static function run(array $atts = []): void {
		$n = \WorkerJob::drain("register_pid");
		echo "[register_pid] {$n} Job(s) abgearbeitet\n";
	}
}
