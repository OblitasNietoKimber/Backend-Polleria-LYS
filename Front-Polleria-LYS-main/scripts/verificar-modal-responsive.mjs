import {chromium,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base='http://localhost:5173';
const directory=fileURLToPath(new URL('../../../respaldo-insforge-antes-integracion-20261115/verificacion-ui/',import.meta.url));
const readme=await readFile(new URL('../../README.md',import.meta.url),'utf8');
const cells=readme.split('\n').find(s=>s.includes('**Administrador**')).split('|').map(s=>s.replaceAll('`','').trim());
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();
try{
 await mkdir(directory,{recursive:true});await page.goto(base+'/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(cells[2]);await page.getByLabel('Contraseña',{exact:true}).fill(cells[3]);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page).toHaveURL(base+'/');
 for(const [width,height] of [[1900,900],[1366,650],[1024,600],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.goto(base+'/mesas');await page.locator('.mesa-card.mesa-ocupada').first().click();await expect(page.locator('.attention-confirm')).toBeVisible();
  const bounds=await page.evaluate(()=>{
   const selectors=['.mesa-modal-card','.mesa-modal-header','.mesa-modal-footer'];const boxes=selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {selector:s,top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
   const body=document.querySelector('.mesa-modal-body');return {boxes,bodyScrolls:body.scrollHeight>body.clientHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  for(const box of bounds.boxes){expect(box.top).toBeGreaterThanOrEqual(0);expect(box.bottom).toBeLessThanOrEqual(height);expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);}
  expect(bounds.pageOverflow).toBe(false);expect(bounds.bodyScrolls).toBe(true);
  await page.locator('.attention-confirm input').check();await expect(page.locator('.attention-confirm input')).toBeChecked();await page.locator('.attention-confirm input').uncheck();
  // Trial checks prove hit testing without changing an order or account.
  await page.locator('.mesa-modal-body button:enabled').last().click({trial:true,timeout:3000});
  await page.screenshot({path:directory+`/modal-responsive-${width}x${height}.png`});await page.locator('.mesa-modal-close-btn').click();await expect(page.locator('.mesa-modal-card')).toHaveCount(0);
  console.log(JSON.stringify({viewport:`${width}x${height}`,headerAndFooterVisible:true,checkboxClickable:true,internalScroll:true,horizontalOverflow:false}));
 }
 await page.evaluate(async()=>{const auth=await import('/src/services/authService.js');await auth.logout();});
}finally{await browser.close();}
