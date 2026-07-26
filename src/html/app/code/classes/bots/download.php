<?php
/*
 * download — manueller/Debug-Drain: arbeitet alle offenen download-Jobs einmal ab.
 * Im Normalbetrieb übernimmt das der worker-Daemon. Logik: \worker\download.
 *
 *   php app/bot.php -t download
 */

namespace bots;

class download {

	public static function run(array $atts = []): void {
		$n = \WorkerJob::drain("download");
		echo "[download] {$n} Job(s) abgearbeitet\n";
	}
}
