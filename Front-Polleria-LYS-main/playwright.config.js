import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['e2e/**/*.spec.js', 'tests/e2e/**/*.spec.js'], timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://localhost:5173', headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    } : {},
  },
  // Todas las APIs se interceptan en las pruebas; no usar credenciales reales ni un servidor abierto.
  webServer: {
    command: 'npm run dev -- --host localhost', url: 'http://localhost:5173', reuseExistingServer: false,
    env: {
      VITE_INSFORGE_BASE_URL: 'https://b9zz47j5.us-east.insforge.app',
      VITE_INSFORGE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.browser-test',
    },
  },
});
