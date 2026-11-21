import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const frontendPort = process.env.LOCAL_FLOW_FRONTEND_PORT || '5180';
const backendPort = process.env.LOCAL_FLOW_PORT || '5191';
const backendUrl = `http://127.0.0.1:${backendPort}`;
const backend=spawn(process.execPath,['scripts/local-server.mjs'],{cwd,stdio:'inherit',windowsHide:true});
let frontend;
try{
 for(let i=0;i<100;i++){
  try{const r=await fetch(`${backendUrl}/health`);if((await r.json()).mode==='local')break;}catch{}
  if(i===99)throw new Error('No se pudo iniciar la base local');
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','flujo-local','--host','127.0.0.1','--port',frontendPort,'--strictPort'],{
  cwd,stdio:'inherit',windowsHide:true,env:{...process.env,VITE_FLUJO_ATENCIONES:'true',VITE_LOCAL_FLOW_BACKEND_PORT:backendPort,VITE_INSFORGE_BASE_URL:backendUrl,VITE_INSFORGE_ANON_KEY:'local-public-anon'},
 });
 frontend.on('exit',()=>backend.kill());
 backend.on('exit',()=>frontend?.kill());
}catch(error){console.error(error.message);backend.kill();process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{frontend?.kill();backend.kill();});
