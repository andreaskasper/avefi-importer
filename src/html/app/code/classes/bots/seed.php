<?php
/*
 * Seed-Bot — legt eine Standard-Institution + einen Admin-User an
 * (bzw. setzt dessen Passwort neu). Muss im Container laufen, wo PHP das
 * Passwort mit Argon2id hashen kann.
 *
 *   docker compose exec web php app/bot.php -t seed
 *
 * Zugangsdaten optional über Umgebungsvariablen SEED_EMAIL / SEED_PASSWORD.
 */

namespace bots;

class seed {

	public static function run(array $atts = []): void {
		$email    = getenv("SEED_EMAIL")    ?: "admin@av-efi.net";
		$password = getenv("SEED_PASSWORD") ?: "changeme";

		$instId = \DB::value("SELECT id FROM institutions ORDER BY id LIMIT 1");
		if ($instId === null) {
			$instId = \DB::insert("institutions", ["name" => "Deutsches Filminstitut", "slug" => "dfi"]);
			echo "[*] Institution angelegt (#{$instId})\n";
		}

		$existing = \User::byEmail($email);
		if ($existing !== null) {
			\DB::execute(
				"UPDATE users SET password_hash = :h, active = true WHERE id = :id",
				[":h" => \User::hashPassword($password), ":id" => $existing->id()]
			);
			echo "[*] Passwort für {$email} aktualisiert.\n";
			return;
		}

		$id = \User::create($email, $password, "Administrator", (int)$instId, true);
		echo "[*] Admin-User #{$id} angelegt: {$email} / {$password}\n";
	}
}
