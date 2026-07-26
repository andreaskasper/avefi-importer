<?php
/*
 * Job — jobs-Queue. enqueue() stellt ein, claim() holt atomar den nächsten
 * offenen Job (FOR UPDATE SKIP LOCKED → mehrere Worker-Prozesse sind sicher).
 */

class Job {

	public static function enqueue(string $type, ?string $importId = null, array $payload = []): int {
		return (int)DB::insert("jobs", [
			"type"      => $type,
			"import_id" => $importId,
			"status"    => "queued",
			"payload"   => $payload ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : "{}",
		], "id");
	}

	/**
	 * Holt den nächsten offenen Job (optional nach Typ), markiert ihn als running.
	 * @return array<string,mixed>|null
	 */
	public static function claim(?string $type = null): ?array {
		$pdo = DB::pdo();
		$pdo->beginTransaction();
		try {
			$sql = "SELECT * FROM jobs WHERE status = 'queued'"
				. ($type !== null ? " AND type = :t" : "")
				. " ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1";
			$st = $pdo->prepare($sql);
			if ($type !== null) $st->bindValue(":t", $type);
			$st->execute();
			$row = $st->fetch();

			if ($row === false) { $pdo->commit(); return null; }

			$up = $pdo->prepare("UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1 WHERE id = :id");
			$up->execute([":id" => $row["id"]]);
			$pdo->commit();
			return $row;
		} catch (\Throwable $e) {
			if ($pdo->inTransaction()) $pdo->rollBack();
			throw $e;
		}
	}

	public static function complete(int $id): void {
		DB::execute("UPDATE jobs SET status = 'done', finished_at = now() WHERE id = :id", [":id" => $id]);
	}

	public static function fail(int $id, string $error): void {
		DB::execute("UPDATE jobs SET status = 'failed', finished_at = now(), error = :e WHERE id = :id",
			[":e" => mb_substr($error, 0, 2000), ":id" => $id]);
	}
}
