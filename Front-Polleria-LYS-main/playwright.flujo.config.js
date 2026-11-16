import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/flow-e2e',timeout:60000,workers:1,fullyParallel:false,
 use:{baseURL:'http://127.0.0.1:5180',headless:true},
 webServer:{command:'npm run dev:flujo',url:'http://127.0.0.1:5180',reuseExistingServer:false,timeout:60000,env:{LOCAL_FLOW_MEMORY:'1'}},
});
