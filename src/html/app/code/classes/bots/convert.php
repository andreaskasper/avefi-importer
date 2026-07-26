<?php
/*
 * convert — manueller/Debug-Drain: arbeitet alle offenen convert-Jobs einmal ab.
 * Im Normalbetrieb übernimmt das der worker-Daemon. Logik: \worker\convert.
 *
 *   php app/bot.php -t convert
 */

namespace bots;

class convert {

	public static function run(array $atts = []): void {
		$n = \WorkerJob::drain("convert");
		echo "[convert] {$n} Job(s) abgearbeitet\n";
	}
}
