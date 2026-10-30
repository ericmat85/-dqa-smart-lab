import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:4173',timezoneId:'Asia/Taipei',actionTimeout:10000,trace:'retain-on-failure',
  launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-dev-shm-usage']}},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
});
