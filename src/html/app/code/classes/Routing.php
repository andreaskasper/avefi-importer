<?php
/*
 * AVefi Importer — Routing.
 * Schlanker Regex-/Switch-Dispatcher. Reihenfolge ist relevant.
 */

class Routing {

	public static function start(): void {
		$path = parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH) ?: "/";
		$path = rtrim($path, "/");
		if ($path === "") $path = "/";

		/* REST-/JSON-API: /api/{namespace}/{method}[.{format}] */
		if (preg_match('@^/api/(?P<namespace>[A-Za-z0-9]+)[./](?P<method>[A-Za-z0-9]+)(?:[./](?P<format>[a-z]+))?@', $path, $m)) {
			\API::run($m["namespace"], $m["method"], $m["format"] ?? null, $_REQUEST);
			exit;
		}

		/* Import-Detailseiten: /imports/<uuid>/records[…] */
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/records/(\d+)/edit$@', $path, $m)) { self::recordEdit($m[1], (int)$m[2]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/records/(\d+)/save$@', $path, $m)) { self::recordSave($m[1], (int)$m[2]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/records$@', $path, $m))            { self::records($m[1]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/report$@', $path, $m))             { self::report($m[1]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/details$@', $path, $m))            { self::details($m[1]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/avefi\.json$@', $path, $m))        { self::avefiJson($m[1]); exit; }
		if (preg_match('@^/imports/([0-9a-fA-F-]{36})/original$@', $path, $m))           { self::originalDownload($m[1]); exit; }

		/* Format-Review (nur Admin) */
		if (preg_match('@^/reviews/(\d+)$@', $path, $m)) { self::review((int)$m[1]); exit; }

		/* Usermanager (nur Admin) */
		if (preg_match('@^/users/(\d+)$@', $path, $m)) { self::userDetail((int)$m[1]); exit; }

		switch ($path) {
			case "/login":
				self::login();
				exit;

			case "/logout":
				MyUser::logout();
				self::redirect("/login");
				exit;

			case "/upload":
				self::upload();
				exit;

			case "/upload/url":
				self::uploadUrl();
				exit;

			case "/import/delete":
				self::deleteImport();
				exit;

			case "/profile":
				self::profile();
				exit;

			case "/reviews":
				self::reviewsList();
				exit;

			case "/users":
				self::usersIndex();
				exit;

			case "/":
				if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
				self::view("page_index/page_index", ["active" => "imports"]);
				exit;
		}

		http_response_code(404);
		self::view("page_404/page_404");
		exit;
	}

	/** Login-Seite: GET rendert das Formular, POST prüft die Anmeldung. */
	private static function login(): void {
		if (MyUser::isLoggedIn()) { self::redirect("/"); exit; }

		$error = null;
		$email = "";
		if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") {
			$email    = trim((string)($_POST["email"] ?? ""));
			$password = (string)($_POST["password"] ?? "");
			if (MyUser::attempt($email, $password)) { self::redirect("/"); exit; }
			$error = "E-Mail oder Passwort ist falsch.";
		}
		self::view("page_login/page_login", ["error" => $error, "email" => $email]);
	}

	/**
	 * Datei-Upload (POST, multipart). Legt einen Import an, speichert das Original
	 * nach /mnt/files/<uuid>/org/<datei> und stellt einen detect-Job in die Queue.
	 * Antwortet immer JSON.
	 */
	private static function upload() {
		try {
			if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") return self::json(["ok" => false, "error" => "Methode nicht erlaubt."], 405);
			$user = MyUser::current();
			if ($user === null)                        return self::json(["ok" => false, "error" => "Nicht angemeldet."], 401);
			if (!Csrf::check($_POST["_csrf"] ?? null)) return self::json(["ok" => false, "error" => "Ungültiges Sicherheits-Token. Seite neu laden."], 403);

			$instId = $user->institutionId();
			if ($instId === null)                      return self::json(["ok" => false, "error" => "Dein Konto ist keiner Institution zugeordnet."], 400);

			$f = $_FILES["file"] ?? null;
			if (!is_array($f))                         return self::json(["ok" => false, "error" => "Keine Datei empfangen."], 400);
			if ((int)($f["error"] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK)
				return self::json(["ok" => false, "error" => self::uploadErrorMessage((int)$f["error"])], 400);

			$origName   = (string)($f["name"] ?? "datei");
			$size       = (int)($f["size"] ?? 0);
			$ext        = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
			$baseFormat = self::baseFormatForExt($ext);
			if ($baseFormat === null)
				return self::json(["ok" => false, "error" => "Format „." . $ext . "“ wird nicht unterstützt (CSV, TSV, XML, EAD, MARC-XML, JSON)."], 415);

			$import = Import::create($instId, $user->id(), Storage::sanitizeFilename($origName), $size, $baseFormat);
			try {
				Storage::storeOriginal($import->id(), (string)$f["tmp_name"], $origName);
			} catch (\Throwable $e) {
				$import->delete();
				return self::json(["ok" => false, "error" => "Speichern fehlgeschlagen: " . $e->getMessage()], 500);
			}

			$import->setStoragePath(Storage::importDir($import->id()));
			$import->setStatus("queued", 100);
			WorkerJob::enqueue("detect", ["import_id" => $import->id()], $import->id());

			return self::json(["ok" => true, "import" => [
				"id"          => $import->id(),
				"filename"    => $import->filename(),
				"base_format" => $baseFormat,
				"status"      => "queued",
			]]);
		} catch (\Throwable $e) {
			return self::json(["ok" => false, "error" => "Unerwarteter Fehler beim Upload."], 500);
		}
	}

	/**
	 * Import per URL: legt einen Import an und stellt einen download-Job in die Queue.
	 * Normaler Formular-POST → Redirect zurück aufs Dashboard.
	 */
	private static function uploadUrl() {
		if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
		if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") { self::redirect("/"); exit; }
		if (!Csrf::check($_POST["_csrf"] ?? null)) { self::redirect("/?urlerror=token"); exit; }

		$user   = MyUser::current();
		$instId = $user->institutionId();
		if ($instId === null) { self::redirect("/?urlerror=inst"); exit; }

		$url = trim((string)($_POST["url"] ?? ""));
		if (!self::isSafeUrl($url)) { self::redirect("/?urlerror=url"); exit; }

		$name = Storage::sanitizeFilename(self::filenameFromUrl($url));
		$ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
		$base = self::baseFormatForExt($ext);   // null → der download-Worker rät anhand des Inhalts

		$import = Import::create($instId, $user->id(), $name, 0, $base);
		WorkerJob::enqueue("download", ["import_id" => $import->id(), "url" => $url], $import->id());
		self::redirect("/?added=1");
	}

	private static function filenameFromUrl(string $url): string {
		$path = (string)parse_url($url, PHP_URL_PATH);
		$name = basename($path);
		return $name !== "" && $name !== "/" ? $name : "download";
	}

	/** Grundlegende SSRF-Absicherung: nur http/https, keine lokalen/privaten Hosts. */
	private static function isSafeUrl(string $url): bool {
		$p = parse_url($url);
		if (!$p || empty($p["scheme"]) || empty($p["host"])) return false;
		if (!in_array(strtolower($p["scheme"]), ["http", "https"], true)) return false;
		$host = strtolower($p["host"]);
		if (in_array($host, ["localhost", "0.0.0.0", "::1"], true)) return false;
		if (preg_match('/^(10\.|127\.|192\.168\.|169\.254\.)/', $host)) return false;
		if (preg_match('/^172\.(1[6-9]|2\d|3[01])\./', $host)) return false;
		return true;
	}

	/** Löscht einen Import (Zeile + Dateien). POST, JSON. */
	private static function deleteImport() {
		try {
			if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") return self::json(["ok" => false, "error" => "Methode nicht erlaubt."], 405);
			$user = MyUser::current();
			if ($user === null)                        return self::json(["ok" => false, "error" => "Nicht angemeldet."], 401);
			if (!Csrf::check($_POST["_csrf"] ?? null)) return self::json(["ok" => false, "error" => "Ungültiges Sicherheits-Token."], 403);

			$id = trim((string)($_POST["id"] ?? ""));
			if (!preg_match('/^[0-9a-fA-F-]{36}$/', $id)) return self::json(["ok" => false, "error" => "Ungültige ID."], 400);

			$import = Import::byId($id);
			if ($import === null || $import->institutionId() !== $user->institutionId())
				return self::json(["ok" => false, "error" => "Import nicht gefunden."], 404);

			Storage::deleteImport($import->id());
			$import->delete();
			return self::json(["ok" => true]);
		} catch (\Throwable $e) {
			return self::json(["ok" => false, "error" => "Unerwarteter Fehler beim Löschen."], 500);
		}
	}

	private static function json(array $data, int $code = 200): void {
		http_response_code($code);
		header("Content-Type: application/json; charset=utf-8");
		echo json_encode($data, JSON_UNESCAPED_UNICODE);
	}

	private static function baseFormatForExt(string $ext): ?string {
		$map = ["csv" => "csv", "tsv" => "tsv", "xml" => "xml", "ead" => "ead", "marcxml" => "marcxml", "marc" => "marc", "json" => "json"];
		return $map[$ext] ?? null;
	}

	private static function uploadErrorMessage(int $code): string {
		switch ($code) {
			case UPLOAD_ERR_INI_SIZE:
			case UPLOAD_ERR_FORM_SIZE: return "Datei ist zu groß (max. 200 MB).";
			case UPLOAD_ERR_PARTIAL:   return "Upload wurde unterbrochen.";
			case UPLOAD_ERR_NO_FILE:   return "Keine Datei empfangen.";
			default:                   return "Upload-Fehler (Code " . $code . ").";
		}
	}

	/** Profil-Seite: Anzeigename und Passwort ändern. */
	private static function profile(): void {
		if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
		$user = MyUser::current();
		$msg = null; $err = null;

		if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") {
			if (!Csrf::check($_POST["_csrf"] ?? null)) {
				$err = "Ungültiges Sicherheits-Token. Bitte die Seite neu laden.";
			} else {
				$action = (string)($_POST["action"] ?? "");
				if ($action === "name") {
					$name = trim((string)($_POST["name"] ?? ""));
					if ($name === "")      $err = "Der Name darf nicht leer sein.";
					else { $user->setName($name); $msg = "Name gespeichert."; }
				} elseif ($action === "password") {
					$cur  = (string)($_POST["current"] ?? "");
					$new  = (string)($_POST["new"] ?? "");
					$conf = (string)($_POST["confirm"] ?? "");
					if (!$user->verifyPassword($cur))   $err = "Das aktuelle Passwort ist falsch.";
					elseif (mb_strlen($new) < 8)        $err = "Das neue Passwort muss mindestens 8 Zeichen haben.";
					elseif ($new !== $conf)             $err = "Die Passwort-Bestätigung stimmt nicht überein.";
					else { $user->setPassword($new); $msg = "Passwort geändert."; }
				}
			}
		}

		self::view("page_profile/page_profile", ["active" => "", "msg" => $msg, "err" => $err]);
	}

	/** Sichert Login + Zugehörigkeit des Imports zur Institution; sonst 404. */
	private static function ownedImportOr404(string $importId): Import {
		if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
		$user   = MyUser::current();
		$import = Import::byId($importId);
		if ($import === null || $import->institutionId() !== $user->institutionId()) {
			http_response_code(404);
			self::view("page_404/page_404");
			exit;
		}
		return $import;
	}

	/** Datensatz-Liste eines Imports. */
	private static function records(string $importId): void {
		$import  = self::ownedImportOr404($importId);
		$records = Record::forImport($importId);
		self::view("page_records/page_records", ["active" => "imports", "import" => $import, "records" => $records]);
	}

	/** Parse-/Validierungsbericht eines Imports (Fehlerreport). */
	private static function report(string $importId): void {
		$import = self::ownedImportOr404($importId);
		self::view("page_report/page_report", ["active" => "imports", "import" => $import]);
	}

	/** Fehler-Detailseite (Verarbeitungsfehler mit Position/Ausschnitt/Erklärung). */
	private static function details(string $importId): void {
		$import = self::ownedImportOr404($importId);
		$report = $import->report();
		$detail = is_array($report) && isset($report["parse_detail"]) && is_array($report["parse_detail"])
			? $report["parse_detail"] : null;
		// Fallback: Live-Diagnose, falls kein gespeicherter Bericht vorliegt (Altimporte).
		if ($detail === null) {
			$path = Storage::firstOrgFile($importId);
			if ($path !== null) $detail = ParseDiagnostics::analyze($path, $import->baseFormat());
		}
		$failed = WorkerJob::lastFailedForImport($importId);
		self::view("page_details/page_details", [
			"active" => "imports", "import" => $import, "detail" => $detail, "failed" => $failed,
		]);
	}

	/** Datensatz-Editor. */
	private static function recordEdit(string $importId, int $recordId): void {
		$import = self::ownedImportOr404($importId);
		$rec    = Record::find($recordId, $importId);
		if ($rec === null) { http_response_code(404); self::view("page_404/page_404"); exit; }
		self::view("page_record_edit/page_record_edit", [
			"active" => "imports", "import" => $import, "record" => $rec,
			"saved"  => isset($_GET["saved"]), "error" => $_GET["error"] ?? null,
		]);
	}

	/** Speichern des Editors (POST). */
	private static function recordSave(string $importId, int $recordId): void {
		$import = self::ownedImportOr404($importId);
		if (($_SERVER["REQUEST_METHOD"] ?? "GET") !== "POST") { self::redirect("/imports/{$importId}/records/{$recordId}/edit"); exit; }
		$rec = Record::find($recordId, $importId);
		if ($rec === null) { http_response_code(404); self::view("page_404/page_404"); exit; }
		if (!Csrf::check($_POST["_csrf"] ?? null)) { self::redirect("/imports/{$importId}/records/{$recordId}/edit?error=csrf"); exit; }

		$existing = json_decode((string)($rec["data_json"] ?? "{}"), true) ?: [];
		$data = self::buildRecordData($_POST, is_array($existing["source"] ?? null) ? $existing["source"] : []);
		Record::save($recordId, $importId, $data, Completeness::forRecord($data));
		self::redirect("/imports/{$importId}/records/{$recordId}/edit?saved=1");
	}

	/** Baut aus POST-Daten den internen AVefi-Record (source bleibt erhalten). */
	private static function buildRecordData(array $post, array $source): array {
		$w = (array)($post["work"] ?? []);
		$str = fn(string $k) => isset($w[$k]) && trim((string)$w[$k]) !== "" ? trim((string)$w[$k]) : null;

		$titlesAdd = [];
		foreach (preg_split('/[;\n]+/', (string)($w["titles_additional"] ?? "")) ?: [] as $t) {
			$t = trim($t); if ($t !== "") $titlesAdd[] = $t;
		}

		$contributors = [];
		foreach ((array)($post["contributors"] ?? []) as $c) {
			$name = trim((string)($c["name"] ?? ""));
			if ($name === "") continue;
			$role = trim((string)($c["role"] ?? ""));
			$contributors[] = ["role" => $role !== "" ? $role : "contributor", "name" => $name];
		}

		$work = [
			"title"             => $str("title"),
			"titles_additional" => $titlesAdd,
			"year"              => (preg_match('/\d{4}/', (string)($w["year"] ?? ""), $ym)) ? (int)$ym[0] : null,
			"work_type"         => $str("work_type"),
			"country"           => $str("country"),
			"genre"             => $str("genre"),
			"language"          => $str("language"),
			"description"       => $str("description"),
			"contributors"      => $contributors,
		];

		$manifestations = [];
		foreach ((array)($post["manifestations"] ?? []) as $m) {
			$carrier = trim((string)($m["carrier"] ?? ""));
			$date    = trim((string)($m["date"] ?? ""));
			$note    = trim((string)($m["note"] ?? ""));
			$dur     = preg_match('/\d+/', (string)($m["duration_min"] ?? ""), $dm) ? (int)$dm[0] : null;
			if ($carrier === "" && $date === "" && $note === "" && $dur === null) continue;
			$manifestations[] = array_filter([
				"carrier" => $carrier ?: null, "date" => $date ?: null, "duration_min" => $dur, "note" => $note ?: null,
			], fn($v) => $v !== null && $v !== "");
		}

		$items = [];
		foreach ((array)($post["items"] ?? []) as $it) {
			$inst = trim((string)($it["holding_institution"] ?? ""));
			$sig  = trim((string)($it["signature"] ?? ""));
			$loc  = trim((string)($it["location"] ?? ""));
			$cond = trim((string)($it["condition"] ?? ""));
			if ($inst === "" && $sig === "" && $loc === "" && $cond === "") continue;
			$items[] = array_filter([
				"holding_institution" => $inst ?: null, "signature" => $sig ?: null, "location" => $loc ?: null, "condition" => $cond ?: null,
			], fn($v) => $v !== null && $v !== "");
		}

		return ["work" => $work, "manifestations" => $manifestations, "items" => $items, "source" => $source];
	}

	/** Download der erzeugten AVefi-JSON eines Imports. */
	private static function avefiJson(string $importId): void {
		self::ownedImportOr404($importId);
		$path = Storage::avefiPath($importId);
		if (!is_file($path)) {
			http_response_code(404);
			header("Content-Type: text/plain; charset=utf-8");
			echo "Noch keine AVefi-JSON vorhanden (Import noch nicht konvertiert).";
			exit;
		}
		header("Content-Type: application/json; charset=utf-8");
		header('Content-Disposition: attachment; filename="avefi-' . $importId . '.json"');
		readfile($path);
		exit;
	}

	/** Sichert Login + Admin-Rechte; sonst 403. */
	private static function requireAdmin(): User {
		if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
		$user = MyUser::current();
		if (!$user->isAdmin()) { http_response_code(403); self::view("page_noaccess/page_noaccess"); exit; }
		return $user;
	}

	/** Liste offener Format-Reviews (Admin). */
	private static function reviewsList(): void {
		self::requireAdmin();
		self::view("page_reviews/page_reviews", [
			"active"   => "reviews",
			"reviews"  => FormatReview::listOpen(),
			"resolved" => isset($_GET["resolved"]),
			"rejected" => isset($_GET["rejected"]),
		]);
	}

	/** Review-Detail (GET) bzw. Auflösung (POST). */
	private static function review(int $id): void {
		self::requireAdmin();
		$review = FormatReview::find($id);
		if ($review === null) { http_response_code(404); self::view("page_404/page_404"); exit; }

		if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") { self::reviewAction($id, $review); return; }

		self::view("page_review/page_review", [
			"active"   => "reviews",
			"review"   => $review,
			"import"   => Import::byId((string)$review["import_id"]),
			"profiles" => DB::rows("SELECT converter_key, label FROM format_profiles ORDER BY label"),
			"error"    => $_GET["error"] ?? null,
		]);
	}

	private static function reviewAction(int $id, array $review): void {
		if (!Csrf::check($_POST["_csrf"] ?? null)) { self::redirect("/reviews/{$id}?error=csrf"); exit; }
		$importId = (string)$review["import_id"];
		$import   = Import::byId($importId);
		if ($import === null) { self::redirect("/reviews?error=import"); exit; }

		$action = (string)($_POST["action"] ?? "");
		if ($action === "assign") {
			$key   = trim((string)($_POST["converter_key"] ?? ""));
			$valid = ConverterFactory::make($key) !== null
				|| DB::value("SELECT 1 FROM format_profiles WHERE converter_key = :k", [":k" => $key]) !== null;
			if ($key === "" || !$valid) { self::redirect("/reviews/{$id}?error=converter"); exit; }

			$label     = ConverterFactory::available()[$key] ?? ConverterFactory::label($key);
			$profileId = FormatProfile::ensure($key, $label, $import->baseFormat());
			$import->setFormatProfile($profileId);
			$import->setStatus("converting");
			WorkerJob::enqueue("convert", ["import_id" => $importId, "converter_key" => $key], $importId);
			FormatReview::setStatus($id, "resolved");
			self::redirect("/reviews?resolved=1");
			exit;
		}
		if ($action === "reject") {
			$import->setStatus("error");
			FormatReview::setStatus($id, "rejected");
			self::redirect("/reviews?rejected=1");
			exit;
		}
		self::redirect("/reviews/{$id}");
		exit;
	}

	/** Usermanager: Liste (GET) bzw. Anlegen (POST). Nur Admin. */
	private static function usersIndex(): void {
		$admin = self::requireAdmin();
		if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") { self::userCreate(); return; }
		self::view("page_users/page_users", [
			"active"       => "",
			"users"        => User::allRows(),
			"institutions" => DB::rows("SELECT id, name FROM institutions ORDER BY name"),
			"self_id"      => $admin->id(),
			"created"      => isset($_GET["created"]),
			"error"        => $_GET["error"] ?? null,
			"msg"          => $_GET["msg"] ?? null,
		]);
	}

	private static function userCreate(): void {
		if (!Csrf::check($_POST["_csrf"] ?? null)) { self::redirect("/users?error=csrf"); exit; }
		$email    = trim((string)($_POST["email"] ?? ""));
		$name     = trim((string)($_POST["name"] ?? ""));
		$password = (string)($_POST["password"] ?? "");
		$isAdmin  = !empty($_POST["is_admin"]);
		$instId   = ($_POST["institution_id"] ?? "") !== "" ? (int)$_POST["institution_id"] : null;

		if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { self::redirect("/users?error=email"); exit; }
		if ($name === "")            { self::redirect("/users?error=name"); exit; }
		if (mb_strlen($password) < 8) { self::redirect("/users?error=pw"); exit; }

		try {
			User::create($email, $password, $name, $instId, $isAdmin);
		} catch (\Throwable $e) {
			self::redirect("/users?error=dup");
			exit;
		}
		self::redirect("/users?created=1");
	}

	/** Usermanager: Detail/Bearbeiten (GET) bzw. Aktion (POST). Nur Admin. */
	private static function userDetail(int $id): void {
		$admin = self::requireAdmin();
		$user  = User::load($id);
		if ($user === null) { http_response_code(404); self::view("page_404/page_404"); exit; }
		if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "POST") { self::userAction($id, $user, $admin); return; }
		self::view("page_user_edit/page_user_edit", [
			"active"       => "",
			"user"         => $user,
			"institutions" => DB::rows("SELECT id, name FROM institutions ORDER BY name"),
			"is_self"      => $id === $admin->id(),
			"saved"        => isset($_GET["saved"]),
			"error"        => $_GET["error"] ?? null,
		]);
	}

	private static function userAction(int $id, User $user, User $admin): void {
		if (!Csrf::check($_POST["_csrf"] ?? null)) { self::redirect("/users/{$id}?error=csrf"); exit; }
		$isSelf = $id === $admin->id();
		$action = (string)($_POST["action"] ?? "");

		switch ($action) {
			case "save":
				$name = trim((string)($_POST["name"] ?? ""));
				if ($name === "") { self::redirect("/users/{$id}?error=name"); exit; }
				$user->setName($name);
				// Selbstschutz: eigenes Konto nicht entmachten/sperren.
				$user->setAdmin($isSelf ? true : !empty($_POST["is_admin"]));
				$user->setActive($isSelf ? true : !empty($_POST["active"]));
				$user->setInstitution(($_POST["institution_id"] ?? "") !== "" ? (int)$_POST["institution_id"] : null);
				self::redirect("/users/{$id}?saved=1");
				exit;

			case "resetpw":
				$new = (string)($_POST["new"] ?? "");
				if (mb_strlen($new) < 8) { self::redirect("/users/{$id}?error=pw"); exit; }
				$user->setPassword($new);
				self::redirect("/users/{$id}?saved=1");
				exit;

			case "lock":
				if ($isSelf) { self::redirect("/users?error=self"); exit; }
				$user->setActive(false);
				self::redirect("/users?msg=locked");
				exit;

			case "unlock":
				$user->setActive(true);
				self::redirect("/users?msg=unlocked");
				exit;

			case "delete":
				if ($isSelf) { self::redirect("/users?error=self"); exit; }
				$user->delete();
				self::redirect("/users?msg=deleted");
				exit;
		}
		self::redirect("/users/{$id}");
		exit;
	}

	/** Download der hochgeladenen Originaldatei (Owner oder Admin). */
	private static function originalDownload(string $importId): void {
		if (!MyUser::isLoggedIn()) { self::redirect("/login"); exit; }
		$user   = MyUser::current();
		$import = Import::byId($importId);
		if ($import === null || (!$user->isAdmin() && $import->institutionId() !== $user->institutionId())) {
			http_response_code(404); self::view("page_404/page_404"); exit;
		}
		$path = Storage::firstOrgFile($importId);
		if ($path === null || !is_file($path)) {
			http_response_code(404); header("Content-Type: text/plain; charset=utf-8"); echo "Datei nicht gefunden."; exit;
		}
		header("Content-Type: application/octet-stream");
		header('Content-Disposition: attachment; filename="' . Storage::sanitizeFilename($import->filename()) . '"');
		header("Content-Length: " . filesize($path));
		readfile($path);
		exit;
	}

	public static function redirect(string $to): void {
		header("Location: " . $to, true, 302);
	}

	/** Bindet ein Template aus app/design/default/ ein und stellt $vars bereit. */
	private static function view(string $tpl, array $vars = []): void {
		extract($vars, EXTR_SKIP);
		include __DIR__ . "/../../design/default/" . $tpl . ".php";
	}
}
