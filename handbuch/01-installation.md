# 1 · Installation & Start

Dieses Kapitel beschrieb die PHP-Fassung und ist überholt. Es nannte drei
Container statt fünf, rief `php app/bot.php -t seed` auf und verwies auf
Port 8080.

Für die aktuelle Fassung gilt **[`src/docs/deployment.md`](../src/docs/deployment.md)**.
Dort stehen Installation, Initialisierung, Start, Bau, Tests, alle
Umgebungsvariablen und die fünf Container (`web`, `worker`, `efi-conv`, `db`,
`adminer`).

Kurzfassung für Ungeduldige:

```bash
git clone https://github.com/andreaskasper/avefi-importer.git
cd avefi-importer/src
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec web npm run migrate
docker compose -f docker-compose.dev.yml exec web npm run seed
```

`seed` legt Institution und Verwaltungskonto an und gibt das Passwort einmalig
aus. Mit `SEED_PASSWORD` lässt es sich vorgeben.

Die Compose-Datei liegt bewusst nicht im Repository — sie enthält Domain,
Traefik-Labels und Zugangsdaten. `src/.env.example` zeigt, welche Variablen
gesetzt sein müssen.

Die Kapitel 2 bis 5 und 7 beschreiben die Bedienung, und die hat sich mit der
Neufassung nicht geändert.
