import tailwindcss from '@tailwindcss/vite'

// AVefi Importer — Nuxt-Konfiguration.
//
// Trennung nach Vertrag (Anlage „Integration und Kompatibilitaet"):
//   app/components  reine Darstellung, keine Mappinglogik
//   server/lib      Mappinglogik, ohne Kenntnis von HTTP oder UI
//   server/api      Endpunkte, duenn, nur Uebersetzung HTTP <-> lib
//   shared/types    Typen, die beide Seiten benutzen
//
// Keine fest verdrahtete Domain: alles ueber runtimeConfig/Umgebungsvariablen.

export default defineNuxtConfig({
  compatibilityDate: '2026-08-25',
  devtools: { enabled: false },
  telemetry: false,

  modules: ['@nuxtjs/i18n'],

  css: ['~/assets/css/app.css'],

  runtimeConfig: {
    dbHost: process.env.DB_HOST || 'db',
    dbPort: process.env.DB_PORT || '5432',
    dbName: process.env.DB_NAME || 'avefi',
    dbUser: process.env.DB_USER || 'avefi',
    dbPass: process.env.DB_PASS || 'avefi',
    filesPath: process.env.FILES_PATH || '/mnt/files',
    efiConvUrl: process.env.EFI_CONV_URL || 'http://efi-conv:8000',
    sessionSecret: process.env.SESSION_SECRET || 'entwicklung-nur-lokal-aendern',
    // Einfacher Demo-Zugriffsschutz (Vertrag Paragraf 3: keine Benutzerverwaltung gefordert)
    demoPassword: process.env.DEMO_PASSWORD || '',
    // Normdaten. authorityEnabledFromEnv() und authorityLimitFromEnv() lesen
    // direkt aus process.env — beide Namen stehen trotzdem hier, damit die
    // runtimeConfig vollstaendig zeigt, woran sich die Anwendung bedient.
    authorityEnabled: process.env.AUTHORITY_ENABLED || '',
    authorityLimit: process.env.AUTHORITY_LIMIT || '500',
    public: {
      // Vertrag: konfigurierbare API-Basis-URL, keine Domainabhaengigkeit
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      appName: 'AVefi Importer'
    }
  },

  i18n: {
    defaultLocale: 'de',
    strategy: 'no_prefix',
    // Mehrere Dateien je Sprache: so kann an Bereichen parallel gearbeitet
    // werden, ohne dass sich Aenderungen in einer grossen Datei ins Gehege kommen.
    locales: [
      {
        code: 'de',
        name: 'Deutsch',
        files: ['de/common.json', 'de/auth.json', 'de/imports.json', 'de/mapping.json', 'de/records.json', 'de/admin.json', 'de/doku.json']
      },
      {
        code: 'en',
        name: 'English',
        files: ['en/common.json', 'en/auth.json', 'en/imports.json', 'en/mapping.json', 'en/records.json', 'en/admin.json', 'en/doku.json']
      }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'avefi_lang',
      redirectOn: 'root'
    }
  },

  nitro: {
    // db/schema.sql gehoert ins Bundle: Der Auslieferungscontainer kopiert nur
    // .output, dort gaebe es die Datei sonst nicht — und ohne sie kann eine
    // gebaute Auslieferung ihr eigenes Schema nicht anlegen.
    serverAssets: [{ baseName: 'db', dir: '../db' }],

    routeRules: {
      // Nichts an dieser Anwendung darf zwischengespeichert werden: jede Seite
      // zeigt Daten der angemeldeten Institution. Ohne diese Koepfe legt ein
      // vorgelagerter Zwischenspeicher (hier Cloudflare) eine angemeldete Seite
      // ab und liefert sie an jeden weiteren Aufrufer aus — nachweislich
      // geschehen, cf-cache-status HIT auf der Importliste ohne Sitzung.
      '/**': {
        headers: {
          'cache-control': 'no-store, private, max-age=0, must-revalidate',
          'cdn-cache-control': 'no-store',
          'cloudflare-cdn-cache-control': 'no-store',
          vary: 'cookie'
        }
      },
      // Statische Mitbringsel duerfen zwischengespeichert werden.
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      '/favicon.ico': { headers: { 'cache-control': 'public, max-age=86400' } },
      '/av-efi-logo.svg': { headers: { 'cache-control': 'public, max-age=86400' } },
      '/favicon.svg': { headers: { 'cache-control': 'public, max-age=86400' } },
      '/robots.txt': { headers: { 'cache-control': 'public, max-age=86400' } }
    }
  },

  vite: {
    // Tailwind 4 und daisyUI 5 — dieselbe Grundlage wie das AVefi-Frontend.
    // Das Aussehen kommt damit aus einem gemeinsamen Designsystem statt aus
    // einem eigenen Theme, das neben AVefi steht und mit ihm auseinanderlaeuft.
    plugins: [tailwindcss()],
    server: {
      // Zugriff ueber die Traefik-Domain im Entwicklungsmodus erlauben
      allowedHosts: true,
      ws: { protocol: 'wss', clientPort: 443 }
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      link: [{ rel: 'icon', href: '/favicon.svg' }]
    }
  }
})
