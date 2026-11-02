import {defineConfig} from '@playwright/test';
export default defineConfig({
 projects:[{name:'cross-system',testDir:'./acceptance'},{name:'material-loans',testDir:'./e2e',testMatch:'material-borrow.spec.js'},{name:'compact-editor',testDir:'./e2e',testMatch:'compact-request-editor.spec.js'}],
 testDir:'./acceptance',outputDir:'./acceptance-results',fullyParallel:false,workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:4176',timezoneId:'Asia/Taipei',actionTimeout:10000,trace:'retain-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-dev-shm-usage']}},
 webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4176 --strictPort',url:'http://127.0.0.1:4176',reuseExistingServer:false},
});
