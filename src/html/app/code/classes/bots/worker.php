<?php
/*
 * worker-Daemon — läuft kontinuierlich, schaut jede Minute in worker_jobs und
 * arbeitet fällige Jobs ab (\worker\<classname>::run($payload)).
 *
 * Als Dauerdienst betreiben (docker compose … restart: always):
 *   php app/bot.php -t worker
 *
 * Neustart-Strategie: Der Prozess beendet sich selbst regelmäßig — `restart: always`
 * startet ihn dann neu. Das ist nicht nur Hygiene gegen Speicherwachstum, sondern der
 * Grund dafür, dass geänderter Code überhaupt ankommt: PHP lädt eine Klasse einmal je
 * Prozess. Ein Dauerläufer arbeitet sonst wochenlang mit dem Stand vom Prozessstart,
 * während die Weboberfläche längst den neuen zeigt — ein Fehlerbild, das viel Zeit
 * kostet, weil nichts darauf hinweist.
 *
 * Die Laufzeit lässt sich über WORKER_MAX_UPTIME (Sekunden) setzen.
 */

namespace bots;

class worker {

	const MAX_UPTIME_DEFAULT = 600;                // 10 Minuten
	const MAX_RAM            = 1024 * 1024 * 1024; // 1 GB

	/** Laufzeit bis zum kontrollierten Neustart. */
	private static function maxUptime(): int {
		$v = (int)(getenv("WORKER_MAX_UPTIME") ?: 0);
		return $v > 0 ? $v : self::MAX_UPTIME_DEFAULT;
	}

	public static function run(array $atts = []): void {
		@ob_implicit_flush(true);   // Ausgaben sofort in die Container-Logs
		$start = time();
		echo "[worker] gestartet " . date("c") . " (Neustart nach " . self::maxUptime() . " s)\n";

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
		if (time() - $start > self::maxUptime()) {
			echo "[worker] Laufzeit erreicht — kontrollierter Neustart (lädt geänderten Code).\n";
			return true;
		}
		if (memory_get_usage(true) > self::MAX_RAM) {
			echo "[worker] RAM > 1 GB — kontrollierter Neustart.\n";
			return true;
		}
		return false;
	}
}
