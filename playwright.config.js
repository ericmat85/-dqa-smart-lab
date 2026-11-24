import {defineConfig,devices} from '@playwright/test';
import {BROWSER_MODES,modeFiles,browserModeEnvironment,browserModePort} from './scripts/ci/browser-modes.mjs';
const selected=process.env.BROWSER_MODE;
const offset=Number(process.env.PLAYWRIGHT_PORT_OFFSET||0);
for(const name of Object.keys(BROWSER_MODES))browserModePort(name,offset);
if(selected&&!Object.hasOwn(BROWSER_MODES,selected))throw Error('UNKNOWN_BROWSER_MODE');
const modes=Object.entries(BROWSER_MODES).filter(([name])=>!selected||name===selected);
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const projects=modes.flatMap(([name,mode])=>{
 const scope=mode.files?{testMatch:mode.files.map(file=>'**/'+file)}:{testMatch:/.*\.spec\.(?:js|mjs)$/,testIgnore:modeFiles.map(file=>'**/'+file)};
 return (mode.original?['desktop','mobile']:['desktop']).map(device=>({name:name+'-'+device,...scope,use:{...(device==='mobile'?{...devices['iPhone 13'],defaultBrowserType:'chromium'}:devices['Desktop Chrome']),baseURL:'http://127.0.0.1:'+browserModePort(name,offset)}}));
});
export default defineConfig({
 testDir:'./e2e',outputDir:'./test-results',fullyParallel:false,workers:2,retries:0,timeout:45000,expect:{timeout:10000},projects,
 use:{timezoneId:'Asia/Taipei',actionTimeout:10000,trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{...(executablePath?{executablePath}:{}),args:['--disable-dev-shm-usage']}},
 webServer:modes.map(([name,mode])=>({command:'npm run dev -- --host 127.0.0.1 --port '+browserModePort(name,offset)+' --strictPort',url:'http://127.0.0.1:'+browserModePort(name,offset),env:browserModeEnvironment(name),reuseExistingServer:false})),
});
