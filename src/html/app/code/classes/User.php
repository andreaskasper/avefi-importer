<?php
/*
 * User — Entity für einen Bearbeiter/eine Bearbeiterin.
 * Aktueller Session-Kontext liegt in der Wrapper-Klasse MyUser.
 */

class User {

	/** @var array<string,mixed> */
	private array $row;

	private function __construct(array $row) {
		$this->row = $row;
	}

	public static function byId(int $id): ?self {
		$r = DB::row("SELECT * FROM users WHERE id = :id AND active", [":id" => $id]);
		return $r ? new self($r) : null;
	}

	public static function byEmail(string $email): ?self {
		$r = DB::row("SELECT * FROM users WHERE lower(email) = lower(:email) AND active", [":email" => $email]);
		return $r ? new self($r) : null;
	}

	/** Lädt einen User ohne active-Filter (für die Admin-Verwaltung). */
	public static function load(int $id): ?self {
		$r = DB::row("SELECT * FROM users WHERE id = :id", [":id" => $id]);
		return $r ? new self($r) : null;
	}

	/** Alle User inkl. Institutionsname (für den Usermanager). @return array<int,array<string,mixed>> */
	public static function allRows(): array {
		return DB::rows(
			"SELECT u.*, inst.name AS institution_name
			   FROM users u
			   LEFT JOIN institutions inst ON inst.id = u.institution_id
			  ORDER BY u.active DESC, lower(u.email)"
		);
	}

	public function id(): int { return (int)$this->row["id"]; }
	public function email(): string { return (string)$this->row["email"]; }
	public function name(): string {
		$n = trim((string)($this->row["name"] ?? ""));
		return $n !== "" ? $n : $this->email();
	}
	public function isAdmin(): bool { return (bool)($this->row["is_admin"] ?? false); }
	public function institutionId(): ?int {
		return isset($this->row["institution_id"]) ? (int)$this->row["institution_id"] : null;
	}

	public function institutionName(): ?string {
		$id = $this->institutionId();
		if ($id === null) return null;
		$v = DB::value("SELECT name FROM institutions WHERE id = :id", [":id" => $id]);
		return $v !== null ? (string)$v : null;
	}

	/** Kürzel für den Avatar (max. 2 Zeichen). */
	public function initials(): string {
		$parts = preg_split('/\s+/', $this->name()) ?: [];
		$ini = "";
		foreach ($parts as $p) {
			if ($p === "") continue;
			$ini .= mb_strtoupper(mb_substr($p, 0, 1));
			if (mb_strlen($ini) >= 2) break;
		}
		return $ini !== "" ? $ini : mb_strtoupper(mb_substr($this->email(), 0, 2));
	}

	public function verifyPassword(string $password): bool {
		$hash = (string)($this->row["password_hash"] ?? "");
		return $hash !== "" && password_verify($password, $hash);
	}

	public function touchLogin(): void {
		DB::execute("UPDATE users SET last_login_at = now() WHERE id = :id", [":id" => $this->id()]);
	}

	public function setName(string $name): void {
		DB::execute("UPDATE users SET name = :n WHERE id = :id", [":n" => $name, ":id" => $this->id()]);
		$this->row["name"] = $name;
	}

	public function setPassword(string $plain): void {
		$hash = self::hashPassword($plain);
		DB::execute("UPDATE users SET password_hash = :h WHERE id = :id", [":h" => $hash, ":id" => $this->id()]);
		$this->row["password_hash"] = $hash;
	}

	public function isActive(): bool { return (bool)($this->row["active"] ?? false); }
	public function lastLoginAt(): ?string { return $this->row["last_login_at"] ?? null; }

	public function setActive(bool $active): void {
		DB::execute("UPDATE users SET active = :a WHERE id = :id", [":a" => $active, ":id" => $this->id()]);
		$this->row["active"] = $active;
	}
	public function setAdmin(bool $admin): void {
		DB::execute("UPDATE users SET is_admin = :a WHERE id = :id", [":a" => $admin, ":id" => $this->id()]);
		$this->row["is_admin"] = $admin;
	}
	public function setInstitution(?int $institutionId): void {
		DB::execute("UPDATE users SET institution_id = :i WHERE id = :id", [":i" => $institutionId, ":id" => $this->id()]);
		$this->row["institution_id"] = $institutionId;
	}
	public function delete(): void {
		DB::execute("DELETE FROM users WHERE id = :id", [":id" => $this->id()]);
	}

	public static function hashPassword(string $password): string {
		$algo = defined("PASSWORD_ARGON2ID") ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
		return password_hash($password, $algo);
	}

	public static function create(string $email, string $password, string $name, ?int $institutionId, bool $isAdmin = false): int {
		return (int)DB::insert("users", [
			"email"          => $email,
			"password_hash"  => self::hashPassword($password),
			"name"           => $name,
			"institution_id" => $institutionId,
			"is_admin"       => $isAdmin,
			"active"         => true,
		]);
	}
}
