<?php
/*
 * WorkerJob — Zugriff auf die worker_jobs-Queue.
 * enqueue() stellt ein, claim() holt atomar den nächsten fälligen Job
 * (FOR UPDATE SKIP LOCKED), process() ruft \worker\<classname>::run($payload) auf.
 */

class WorkerJob {

	public static function enqueue(string $classname, array $payload = [], ?string $importId = null): int {
		return (int)DB::insert("worker_jobs", [
			"classname" => $classname,
			"import_id" => $importId,
			"payload"   => $payload ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : "{}",
		], "id");
	}

	/** Nächsten fälligen Job holen (optional nach classname), als running markieren. */
	public static function claim(?string $classname = null): ?array {
		$pdo = DB::pdo();
		$pdo->beginTransaction();
		try {
			$sql = "SELECT * FROM worker_jobs WHERE status = 'queued' AND run_at <= now()"
				. ($classname !== null ? " AND classname = :c" : "")
				. " ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT 1";
			$st = $pdo->prepare($sql);
			if ($classname !== null) $st->bindValue(":c", $classname);
			$st->execute();
			$row = $st->fetch();

			if ($row === false) { $pdo->commit(); return null; }

			$pdo->prepare("UPDATE worker_jobs SET status = 'running', started_at = now(), attempts = attempts + 1 WHERE id = :id")
				->execute([":id" => $row["id"]]);
			$pdo->commit();
			return $row;
		} catch (\Throwable $e) {
			if ($pdo->inTransaction()) $pdo->rollBack();
			throw $e;
		}
	}

	public static function complete(int $id): void {
		DB::execute("UPDATE worker_jobs SET status = 'done', finished_at = now() WHERE id = :id", [":id" => $id]);
	}

	public static function fail(int $id, string $error): void {
		DB::execute("UPDATE worker_jobs SET status = 'failed', finished_at = now(), error = :e WHERE id = :id",
			[":e" => mb_substr($error, 0, 2000), ":id" => $id]);
	}

	/** Führt einen Job aus: \worker\<classname>::run($payload) + Statuspflege. */
	public static function process(array $job): void {
		$classname = (string)$job["classname"];
		$class     = "\\worker\\" . $classname;
		$payload   = json_decode((string)($job["payload"] ?? "{}"), true) ?: [];
		try {
			if (!class_exists($class) || !method_exists($class, "run")) {
				throw new \RuntimeException("Unbekannte Worker-Klasse: " . $classname);
			}
			call_user_func([$class, "run"], $payload);
			self::complete((int)$job["id"]);
		} catch (\Throwable $e) {
			self::fail((int)$job["id"], $e->getMessage());
			$importId = (string)($job["import_id"] ?? ($payload["import_id"] ?? ""));
			if ($importId !== "") { $imp = Import::byId($importId); if ($imp) $imp->setStatus("error"); }
			echo "[worker] Job #{$job['id']} ({$classname}) fehlgeschlagen: " . $e->getMessage() . "\n";
		}
	}

	/** Arbeitet alle aktuell fälligen Jobs ab (optional gefiltert). @return int Anzahl */
	public static function drain(?string $classname = null): int {
		$n = 0;
		while (($job = self::claim($classname)) !== null) { self::process($job); $n++; }
		return $n;
	}
}
