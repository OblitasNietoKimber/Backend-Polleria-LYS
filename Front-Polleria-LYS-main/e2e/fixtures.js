import { test as base, expect } from '@playwright/test';
export const test = base.extend({
  page: async ({ page }, run) => {
    // Las pruebas que necesitan eventos instalan después su propio Socket.IO simulado.
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await run(page);
  },
});
export { expect };
