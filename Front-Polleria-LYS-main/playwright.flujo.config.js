import {defineConfig} from '@playwright/test';
const baseURL = 'http://127.0.0.1:5184';
export default defineConfig({
 testDir:'tests/flow-e2e',timeout:60000,workers:1,fullyParallel:false,
 use:{baseURL,headless:true},
 webServer:{command:'npm run dev:flujo',url:baseURL,reuseExistingServer:false,timeout:60000,env:{LOCAL_FLOW_MEMORY:'1',LOCAL_FLOW_TEST_CLOCK:'1',LOCAL_FLOW_FRONTEND_PORT:'5184',LOCAL_FLOW_PORT:'5194'}},
});
