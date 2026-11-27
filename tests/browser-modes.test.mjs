import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {BROWSER_MODES,modeFiles,browserModeForFile,browserModeEnvironment,browserModePort} from '../scripts/ci/browser-modes.mjs';
async function sourceWithFixtures(name,seen=new Set()){
 const url=new URL('../e2e/'+name,import.meta.url);if(seen.has(url.href))return '';seen.add(url.href);
 const source=await readFile(url,'utf8');const imports=[...source.matchAll(/from\s+['"](\.\/fixtures\/[^'"]+|\.\/[^/'"]+\.mjs)['"]/g)];
 const dependencies=await Promise.all(imports.map(async match=>{const dependency=new URL(match[1],url);if(!dependency.href.includes('/e2e/'))return '';return sourceWithFixtures(dependency.href.split('/e2e/')[1],seen);}));
 return source+'\n'+dependencies.join('\n');
}
test('every existing browser spec has one mode and explicitly mapped specs still exist',async()=>{
 const files=(await readdir(new URL('../e2e/',import.meta.url))).filter(f=>/\.spec\.(?:js|mjs)$/.test(f));
 assert.equal(new Set(modeFiles).size,modeFiles.length);for(const name of modeFiles)assert.ok(files.includes(name),name);
 for(const name of files){const source=await sourceWithFixtures(name);const mode=browserModeForFile(name);assert.ok(Object.hasOwn(BROWSER_MODES,mode));assert.doesNotMatch(source,/baseURL\s*:\s*['"]https?:\/\/(?:127\.0\.0\.1|localhost):\d+/,name+' must inherit its project URL for extra browser contexts');if(source.includes('api/business')&&name!=='business-connection.spec.mjs')assert.ok(BROWSER_MODES[mode].original,name+' requires authenticated boot');if(source.includes('mockE4Transport')||source.includes('mockE2Transport')||source.includes('/api/preview/ui/live/'))assert.ok(BROWSER_MODES[mode].preview||BROWSER_MODES[mode].ai,name+' requires the preview or native AI client');}
});
test('each browser server explicitly overrides inherited mode flags',()=>{
 const ports=new Set();for(const [name,mode]of Object.entries(BROWSER_MODES)){const env=browserModeEnvironment(name);assert.equal(env.VITE_ORIGINAL_BUSINESS,String(mode.original));assert.equal(env.VITE_BUSINESS_AI,String(mode.ai));assert.equal(env.VITE_PRIVATE_PREVIEW,mode.preview?'1':'0');assert.equal(env.VITE_SANDBOX_API_BASE,mode.preview?'/api/preview':'');assert.equal(env.BUSINESS_ENABLED,'false');assert.equal(env.BUSINESS_AI_ENABLED,'false');ports.add(mode.port);}assert.equal(ports.size,4);assert.throws(()=>browserModeEnvironment('typo'),/UNKNOWN_BROWSER_MODE/);
});

test('parallel local CI shards can use isolated ports without accepting invalid offsets',()=>{assert.equal(browserModePort('business',100),5452);for(const offset of [-1,1.5,1001,NaN])assert.throws(()=>browserModePort('business',offset),/INVALID_BROWSER_PORT_OFFSET/);});
