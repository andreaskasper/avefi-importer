<?php
/*
 * detect — manueller/Debug-Drain: arbeitet alle offenen detect-Jobs einmal ab.
 * Im Normalbetrieb übernimmt das der worker-Daemon. Logik: \worker\detect.
 *
 *   php app/bot.php -t detect
 */

namespace bots;

class detect {

	public static function run(array $atts = []): void {
		$n = \WorkerJob::drain("detect");
		echo "[detect] {$n} Job(s) abgearbeitet\n";
	}
}
