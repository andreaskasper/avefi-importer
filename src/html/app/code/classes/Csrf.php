<?php
/*
 * Csrf — einfacher, session-gebundener CSRF-Token für mutierende Requests.
 */

class Csrf {

	public static function token(): string {
		if (empty($_SESSION["csrf"])) {
			$_SESSION["csrf"] = bin2hex(random_bytes(32));
		}
		return (string)$_SESSION["csrf"];
	}

	public static function check(?string $token): bool {
		return !empty($_SESSION["csrf"]) && is_string($token) && hash_equals((string)$_SESSION["csrf"], $token);
	}
}
