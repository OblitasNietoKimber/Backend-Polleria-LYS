import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Puerto separado para conservar el servidor de desarrollo del usuario.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:5185' },
  webServer: {
    ...base.webServer,
    command: 'npm run dev -- --host localhost --port 5185 --strictPort',
    url: 'http://localhost:5185',
  },
})
