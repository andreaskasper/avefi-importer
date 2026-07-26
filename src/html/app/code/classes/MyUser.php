<?php
/*
 * MyUser — session-gebundener Wrapper um die aktuell angemeldete User-Entity.
 */

class MyUser {

	private static ?User $current = null;
	private static bool $resolved = false;

	/** Prüft Zugangsdaten und meldet bei Erfolg an. */
	public static function attempt(string $email, string $password): bool {
		$user = User::byEmail($email);
		if ($user === null) {
			// Timing an einen echten Verify angleichen (User-Enumeration erschweren).
			password_verify($password, '$2y$12$usdU7YQht4rP0aa8V6oO8O0hh6.g2y3n8pW4o7lqz8jJ2y8gk4Q9C');
			return false;
		}
		if (!$user->verifyPassword($password)) return false;

		self::login($user);
		$user->touchLogin();
		return true;
	}

	public static function login(User $user): void {
		session_regenerate_id(true);
		$_SESSION["user_id"] = $user->id();
		self::$current  = $user;
		self::$resolved = true;
	}

	public static function isLoggedIn(): bool {
		return self::current() !== null;
	}

	public static function current(): ?User {
		if (self::$resolved) return self::$current;
		self::$resolved = true;
		$id = $_SESSION["user_id"] ?? null;
		self::$current = $id !== null ? User::byId((int)$id) : null;
		return self::$current;
	}

	public static function logout(): void {
		self::$current  = null;
		self::$resolved = true;
		$_SESSION = [];
		if (ini_get("session.use_cookies")) {
			$p = session_get_cookie_params();
			setcookie(session_name(), "", time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
		}
		session_destroy();
	}
}
