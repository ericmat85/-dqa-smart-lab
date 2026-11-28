import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DEFAULT_LOGO_NAME,DEFAULT_LOGO_SHA256,DEFAULT_LOGO_PATH,readDefaultWorkspaceLogo} from '../src/defaultWorkspaceLogo.mjs';
import {validateImageChange} from '../src/workspaceImages.mjs';
const bytes=await readFile(new URL('../public/'+DEFAULT_LOGO_PATH,import.meta.url));
test('canonical logo retains exact bytes and fits the existing database image contract',async()=>{let url;const data=await readDefaultWorkspaceLogo(async u=>{url=u;return {ok:true,arrayBuffer:async()=>new Uint8Array(bytes).buffer};},'/');assert.equal(url,'/'+DEFAULT_LOGO_PATH);assert.equal(createHash('sha256').update(bytes).digest('hex'),DEFAULT_LOGO_SHA256);assert.deepEqual(Buffer.from(data.split(',')[1],'base64'),bytes);assert.doesNotThrow(()=>validateImageChange({kind:'logo',image:data,name:DEFAULT_LOGO_NAME,expected_revision:0}));});
test('default logo load rejects missing, altered and oversized assets',async()=>{await assert.rejects(()=>readDefaultWorkspaceLogo(async()=>({ok:false}),'/'),/無法讀取/);for(const data of [new Uint8Array([1,2,3]),new Uint8Array(524289)])await assert.rejects(()=>readDefaultWorkspaceLogo(async()=>({ok:true,arrayBuffer:async()=>data.buffer}),'/'),/完整性|上限/);});
