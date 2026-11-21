import config from './playwright.config.js';
export default {...config,workers:1,timeout:45000,use:{...config.use,baseURL:'http://localhost:5188'},
 webServer:{...config.webServer,command:'npm run dev -- --host localhost --port 5188 --strictPort',url:'http://localhost:5188'}};
