// Por defecto solo verifica. Restaurar datos requiere --aplicar, y si hubo
// nuevas operaciones, además --descartar-pruebas. Conserva una exportación antes.
const {execFileSync,spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),backup=path.resolve(root,'../respaldo-insforge-antes-integracion-20261115');
const metadata=JSON.parse(fs.readFileSync(path.join(backup,'recuperacion.json'),'utf8'));
if(!/^[a-f0-9-]{36}$/.test(metadata.project)||!/^[a-f0-9-]{36}$/.test(metadata.nativeBackup))throw new Error('Identificador de recuperación inválido');
const check=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'insforge-atenciones.cjs'),'recovery-check'],{encoding:'utf8'}).trim());
console.log(JSON.stringify(check,null,2));
if(!process.argv.includes('--aplicar')){console.log('Solo verificación. No se modificó InsForge.');process.exit(0);}
if(!check.datosSinCambios&&!process.argv.includes('--descartar-pruebas'))throw new Error('Hay datos posteriores al respaldo. Se protege su conservación: no se restauró nada. Revisa la exportación y autoriza expresamente --descartar-pruebas si son pruebas que deseas retirar.');
const cli=['/d','/s','/c',`npx -y @insforge/cli backups restore ${metadata.nativeBackup} --project ${metadata.project} --yes --json`];
console.log(execFileSync(process.execPath,[path.join(__dirname,'insforge-atenciones.cjs'),'export-current'],{encoding:'utf8'}).trim());
console.log('Restaurando el respaldo nativo autorizado. Sustituye la base actual por el punto anterior.');
const result=spawnSync('cmd.exe',cli,{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw new Error('InsForge no confirmó la solicitud de restauración. No se cambia el frontend.');
let ready=false;
for(let attempt=0;attempt<120;attempt++){
  const status=JSON.parse(execFileSync('cmd.exe',['/d','/s','/c',`npx -y @insforge/cli projects get --project ${metadata.project} --json`],{encoding:'utf8'}));
  if(status.status==='active'&&!status.operation_status){ready=true;break;}
  console.log('InsForge sigue restaurando; se espera antes de cambiar el código.');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,3000);
}
if(!ready)throw new Error('La restauración continúa. No se cambia el código hasta verificar que InsForge esté activo.');
const envBackup=path.join(backup,'frontend.env.local');
if(fs.existsSync(envBackup))fs.copyFileSync(envBackup,path.join(root,'Front-Polleria-LYS-main/.env.local'));
execFileSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'restaurar-antes-atenciones.ps1'),'-Aplicar'],{stdio:'inherit'});
console.log('Backend, configuración y código recuperados. Inicia npm run dev y vuelve a comprobar localhost:5173.');
