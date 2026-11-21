import {test} from 'node:test';import assert from 'node:assert/strict';
import {newPort,normalizePort,portIssues,readPortDrafts,savePortDraft,gatewayAddress,PORTS_KEY} from '../src/equipmentPorts.mjs';
import {memoryStorage} from '../src/guidedTourStorage.mjs';import {INITIAL_ACCOUNTS} from '../src/demoAccounts.mjs';
const admin=INITIAL_ACCOUNTS.find(a=>a.id==='U001'),readonly=INITIAL_ACCOUNTS.find(a=>a.id==='DEMO-LEVEL3'),equipment=[{id:'EQ-001'}];
const storage=()=>memoryStorage({'dqa-shared-demo-accounts-v1':JSON.stringify(INITIAL_ACCOUNTS),'dqa-request-demo-v2':'KEEP_REQUESTS','dqa-schedules-demo-v1':'KEEP_SCHEDULES'});
globalThis.window=new EventTarget();
test('manual-free drafts remain incomplete, revisions reject lost updates and business sources are untouched',()=>{
 const s=storage(),draft={...newPort(),equipmentId:'EQ-001'};const saved=savePortDraft(draft,admin,equipment,s);assert.equal(saved.revision,1);assert(portIssues(saved).length>0);assert.equal(readPortDrafts(s)[0].channels[0].address,null);assert.throws(()=>savePortDraft(draft,admin,equipment,s),/其他視窗/);assert.equal(s.getItem('dqa-request-demo-v2'),'KEEP_REQUESTS');assert.equal(s.getItem('dqa-schedules-demo-v1'),'KEEP_SCHEDULES');assert(!s.getItem(PORTS_KEY).includes('token'));
});
test('read-only role, unknown equipment and corrupted storage cannot overwrite configuration',()=>{
 const s=storage(),draft={...newPort(),equipmentId:'EQ-001'};assert.throws(()=>savePortDraft(draft,readonly,equipment,s),/權限/);assert.throws(()=>savePortDraft({...draft,equipmentId:'UNKNOWN'},admin,equipment,s),/設備/);s.setItem(PORTS_KEY,'BROKEN');assert.throws(()=>savePortDraft(draft,admin,equipment,s),/無法讀取/);assert.equal(s.getItem(PORTS_KEY),'BROKEN');
});
test('disallowed Modbus functions, invalid IP and ambiguous channel maps are rejected before any network request',()=>{
 const p=newPort();for(const functionCode of [5,6,15,16,23])assert.throws(()=>normalizePort({...p,functionCode}));for(const host of ['example.com','999.1.1.1','127.0.0.1/path','169.254.169.254@evil'])assert.throws(()=>normalizePort({...p,host}));assert.throws(()=>normalizePort({...p,channels:[{...p.channels[0],name:'same'},{...p.channels[0],name:'same'}]}),/重複/);assert.throws(()=>normalizePort({...p,channels:[{...p.channels[0],dataType:'float32',address:65535}]}),/超界/);
});
test('production gateway rejects plaintext, URL credentials, paths and redirects as configuration',()=>{
 for(const url of ['http://192.168.1.2:8765','https://user:password@lab.example','https://lab.example/path','https://lab.example/?token=secret'])assert.throws(()=>gatewayAddress(url,false));assert.equal(gatewayAddress('https://gateway.lab.example/',false),'https://gateway.lab.example');assert.equal(gatewayAddress('http://127.0.0.1:8765',true),'http://127.0.0.1:8765');
});
