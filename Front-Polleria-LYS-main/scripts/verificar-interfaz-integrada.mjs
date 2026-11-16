// Verificación en lectura de las pantallas originales. Credenciales de prueba
// documentadas en el README; nunca se imprimen ni se incorporan al bundle.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.env.INTEGRATED_URL||'http://localhost:5173';
const readme=await readFile(new URL('../../README.md',import.meta.url),'utf8');
const directory=fileURLToPath(new URL('../../../respaldo-insforge-antes-integracion-20261115/verificacion-ui/',import.meta.url));
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
async function login(page,label){
 const line=readme.split('\n').find(line=>line.includes(`**${label}**`));const cells=line.split('|').map(c=>c.replaceAll('`','').trim());
 await page.goto(base+'/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(cells[2]);await page.getByLabel('Contraseña',{exact:true}).fill(cells[3]);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page).toHaveURL(base+'/');
}
async function logout(page){await page.evaluate(async()=>{const auth=await import('/src/services/authService.js');await auth.logout();});}
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage();await login(page,'Administrador');
 await page.goto(base+'/mesas');await expect(page.locator('.mesas-central-workspace')).toBeVisible();await expect(page.locator('.mesa-card').first()).toBeVisible();await expect(page.locator('.flow-main')).toHaveCount(0);
 await page.screenshot({path:directory+'/mesas-original.png',fullPage:true});await page.locator('.mesa-card').first().click();await expect(page.locator('.mesa-modal-body')).toBeVisible();await page.screenshot({path:directory+'/modal-original.png',fullPage:true});await page.locator('.mesa-modal-close-btn').click();
 await page.goto(base+'/caja');await expect(page.locator('.caja-banner')).toBeVisible();await expect(page.getByRole('tab',{name:/Cuentas abiertas/})).toBeVisible();await expect(page.getByText(/Consultando pedidos/)).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);await page.screenshot({path:directory+'/caja-original.png',fullPage:true});
 await page.goto(base+'/cocina');await expect(page.locator('.cocina-board')).toBeVisible();await expect(page.getByText(/Cargando pedidos de cocina/)).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);await page.screenshot({path:directory+'/cocina-original.png',fullPage:true});
 await page.goto(base+'/profile');await expect(page.getByLabel('Nombre',{exact:true})).not.toHaveValue('');
 await logout(page);await ctx.close();
 const clientCtx=await browser.newContext(),client=await clientCtx.newPage();await login(client,'Cliente / Usuario');const orders=client.waitForResponse(r=>r.url().includes('/api/database/records/pedidos'));await client.goto(base+'/pedidos');await expect(client.getByRole('heading',{name:'Mis pedidos',exact:true})).toBeVisible();if(!(await orders).ok())throw new Error('La consulta privada de pedidos del cliente no respondió correctamente');await expect(client.getByRole('alert')).toHaveCount(0);await logout(client);await clientCtx.close();
 console.log(JSON.stringify({base,originalMesas:true,clickModal:true,originalCaja:true,originalCocina:true,profile:true,customerOrders:true,screenshots:directory,businessWrites:false}));
}finally{await browser.close();}
