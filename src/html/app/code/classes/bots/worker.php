<?php
/*
 * worker-Daemon — läuft kontinuierlich, schaut jede Minute in worker_jobs und
 * arbeitet fällige Jobs ab (\worker\<classname>::run($payload)).
 *
 * Als Dauerdienst betreiben (docker compose … restart: always):
 *   php app/bot.php -t worker
 *
 * Neustart-Strategie: Der Prozess beendet sich selbst nach 7 Tagen Laufzeit oder
 * wenn der belegte RAM 1 GB übersteigt — `restart: always` startet ihn dann neu.
 */

namespace bots;

class worker {

	const MAX_UPTIME = 7 * 86400;            // 7 Tage
	const MAX_RAM    = 1024 * 1024 * 1024;   // 1 GB

	public static function run(array $atts = []): void {
		@ob_implicit_flush(true);   // Ausgaben sofort in die Container-Logs
		$start = time();
		echo "[worker] gestartet " . date("c") . "\n";

		while (true) {
			try {
				$done = \WorkerJob::drain();
				if ($done > 0) echo "[worker] {$done} Job(s) abgearbeitet\n";
			} catch (\Throwable $e) {
				echo "[worker] Fehler in der Schleife: " . $e->getMessage() . "\n";
			}

			if (self::shouldRestart($start)) return;
			sleep(60);
			if (self::shouldRestart($start)) return;   // auch nach dem Sleep prüfen
		}
	}

	private static function shouldRestart(int $start): bool {
		if (time() - $start > self::MAX_UPTIME) {
			echo "[worker] Laufzeit > 7 Tage — kontrollierter Neustart.\n";
			return true;
		}
		if (memory_get_usage(true) > self::MAX_RAM) {
			echo "[worker] RAM > 1 GB — kontrollierter Neustart.\n";
			return true;
		}
		return false;
	}
}
