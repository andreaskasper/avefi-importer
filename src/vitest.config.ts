// Vitest-Konfiguration.
//
// Ausserhalb von Nuxt laeuft kein Alias-Aufloeser, deshalb wird "#shared" hier
// noch einmal genannt. Wer weitere Testbereiche ergaenzt, traegt sie in include ein.

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
