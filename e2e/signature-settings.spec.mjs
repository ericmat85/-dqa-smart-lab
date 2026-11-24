import {captureBrowserEvidence} from '../scripts/ci/capture-evidence.mjs';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const member={id:'a2000000-0000-0000-0000-000000000002',display_name:'合成管理者',role_name:'管理者',is_admin:true,permissions:['requests.draft']};
async function setup(page,{signed=false}={}){
 const state={images:Object.fromEntries(['logo','avatar','signature'].map(k=>[k,{image:null,name:'',revision:0}])),imageWrites:[],signed,rows:[],writes:[],conflict:false,unknown:false,reads:0,errors:[],prefs:{member_id:member.id,enabled:false,configured:true,revision:1,service_enabled:true,service_ready:true},mailWrites:[],tests:[],methodData:{method:'IMAGE',revision:0,digital_ready:false,can_manage:true},methodWrites:[],portWrites:[],portChecks:[],portData:{scope_member_id:member.id,config:null,revision:0,configured:false,can_manage:true,verification_approved:false,digital_ready:false,signing_enabled:false}};page.on('pageerror',error=>state.errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('dqa-request-demo-v2','OLD_BROWSER_DATA_DO_NOT_CHANGE');localStorage.setItem('dqa-shared-demo-accounts-v1','OLD_ACCOUNTS_DO_NOT_CHANGE');});
 await page.route('**/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON(),send=(data,status=200)=>route.fulfill({status,json:{...data,trace_id:'I-SYNTHETIC'}});
 if(!path.startsWith('/api/business/'))return send({error:{code:'LIVE_PROVIDER_DISABLED'}},403);
 const endpoint=path.slice('/api/business'.length);
 if(endpoint==='/images'){if(request.method()==='POST'){state.imageWrites.push(body);state.images[body.kind]={image:body.image,name:body.name,revision:state.images[body.kind].revision+1};}return send({data:{member_id:member.id,can_manage:true,images:state.images}});}
 if(endpoint==='/signature-settings'){
 const section=new URL(request.url()).searchParams.get('section');
 if(request.method()==='GET'&&section==='port')return send({data:state.portData});
 if(request.method()==='GET'&&section==='targets')return send({data:state.portTargets||[]});
 if(request.method()==='POST'&&body.action==='save_port'){state.portWrites.push(body);state.portData={...state.portData,config:body.config,revision:state.portData.revision+1,configured:true};return send({data:state.portData});}
 if(request.method()==='POST'&&body.action==='check_port'){state.portChecks.push(body);if(state.checkError)return send({error:{code:state.checkError}},503);return send({data:state.checkResult||{state:'BLOCKED',code:'SIGNATURE_PORT_ORIGIN_NOT_APPROVED',digital_ready:false,signing_enabled:false}});}
 if(request.method()==='POST'){state.methodWrites.push(body);state.methodData={...state.methodData,revision:1};}return send({data:state.methodData});
 }
 if(endpoint==='/notifications/settings'){if(request.method()==='POST'){state.mailWrites.push(body);state.prefs={...state.prefs,enabled:body.enabled,revision:state.prefs.revision+1};}return send({data:state.prefs});}
 if(endpoint==='/notifications/test'){state.tests.push(body);return state.testUnknown?send({error:{code:'WRITE_OUTCOME_UNKNOWN'},outcome_unknown:true},503):send({data:{state:'QUEUED',id:body.operation_id}});}
 if(endpoint==='/notifications/status')return send({data:{settings:state.prefs,counts:{QUEUED:1,SENT:2},records:[]}});
 if(endpoint==='/me')return state.signed?send({member,user:{id:'synthetic-user',email:'synthetic@example.invalid'}}):send({error:{code:'AUTHENTICATION_REQUIRED'}},401);
 if(endpoint==='/login'){state.signed=true;return send({authenticated:true,member});}
 if(endpoint==='/logout'){state.signed=false;return send({signed_out:true,server_session_revoked:true});}
 if(endpoint==='/snapshot'){state.reads++;return send({data:{members:[{id:member.id,display_name:member.display_name,enabled:true}],requests:state.rows,equipment:[],materials:[],schedules:[],trials:[],roles:[],sites:[],departments:[],borrows:[],operations:[],allocations:[],quality:[],qualifications:[],reports:[],...(state.snapshotExtra||{})}});}
 if(endpoint==='/data/requests'&&request.method()==='POST'){state.writes.push(body);if(state.unknown)return send({error:{code:'WRITE_OUTCOME_UNKNOWN'},outcome_unknown:true},503);const row={id:body.id,...body.data,legacy_id:'REQ-SYNTHETIC-1',owner_member_id:member.id,status:'DRAFT',revision:1,created_at:'2026-11-21T00:00:00Z',updated_at:'2026-11-21T00:00:00Z'};state.rows.push(row);if(state.delayWrite)await new Promise(resolve=>{state.releaseWrite=resolve;});return send({data:row},201);}
 if(endpoint.startsWith('/data/requests/')&&request.method()==='PATCH'){state.writes.push(body);if(state.conflict)return send({error:{code:'REVISION_CONFLICT'}},409);state.rows[0]={...state.rows[0],...body.data,revision:state.rows[0].revision+1};return send({data:state.rows[0]});}
 if(endpoint.startsWith('/data/requests/'))return send({data:state.rows.filter(row=>endpoint.endsWith(row.id))});
 return send({data:[],total:0});
 });return state;
}
async function login(page,system='lms'){
 await page.goto('/'+system+'/login');await expect(page.getByLabel('登入帳號（電子郵件）')).toBeVisible();await expect(page.getByLabel('密碼',{exact:true})).toHaveValue('');
 await page.getByLabel('登入帳號（電子郵件）').fill('synthetic@example.invalid');await page.getByLabel('密碼',{exact:true}).fill('Synthetic-password-only');
 await page.locator('form button[type=submit]').click();await expect(page).toHaveURL(new RegExp('/'+system+'/dashboard'));
}
async function personal(page){await page.getByRole('button',{name:'個人帳號選單'}).click();await page.getByRole('button',{name:/個人設定/}).click();return page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'個人設定'})});}
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=';const SAVED='data:image/png;base64,'+PNG;
async function signature(page,seed=true){const s=await setup(page,{signed:true});if(seed)s.images.signature={image:SAVED,name:'signature.png',revision:1};await page.goto('/lms/dashboard');const p=await personal(page);await p.getByRole('button',{name:'開啟電子簽名設定'}).click();return {s,d:page.getByRole('dialog',{name:'電子簽名設定',exact:true})};}
async function ink(page,d){await d.getByRole('radio',{name:'手寫簽名',exact:true}).check();const canvas=d.getByLabel('本帳號預設簽名',{exact:true}),b=await canvas.boundingBox();await page.mouse.move(b.x+25,b.y+30);await page.mouse.down();await page.mouse.move(b.x+60,b.y+50);await page.mouse.move(b.x+100,b.y+25);await page.mouse.up();return canvas;}
test('saved upload survives switching to handwriting and back without reopening',async({page},info)=>{const {s,d}=await signature(page);const image=d.getByAltText('本帳號預設簽名預覽');await expect(image).toBeVisible();await d.getByRole('radio',{name:'手寫簽名',exact:true}).check();await d.getByRole('radio',{name:'上傳簽名檔',exact:true}).check();await expect(image).toBeVisible();await expect(image).toHaveAttribute('src',SAVED);await expect(d.getByRole('button',{name:'儲存預設簽名',exact:true})).toBeEnabled();expect(s.images.signature.image).toBe(SAVED);expect(s.errors).toEqual([]);await captureBrowserEvidence(page,{path:info.outputPath('signature-restored.png')});});
test('handwriting draft and saved upload stay separate across mode switches',async({page})=>{const {s,d}=await signature(page);const canvas=await ink(page,d),drawn=await canvas.evaluate(c=>c.toDataURL());await d.getByRole('radio',{name:'上傳簽名檔',exact:true}).check();await expect(d.getByAltText('本帳號預設簽名預覽')).toHaveAttribute('src',SAVED);await d.getByRole('radio',{name:'手寫簽名',exact:true}).check();expect(await canvas.evaluate(c=>c.toDataURL())).toBe(drawn);await expect(d.getByText('簽名已填寫，可清除後重簽。')).toBeVisible();await d.getByRole('button',{name:'儲存預設簽名',exact:true}).click();await expect(d.getByRole('status')).toContainText('已儲存');expect(s.images.signature.image).toBe(drawn);expect(s.errors).toEqual([]);});
test('explicit clear remains clear across mode switches; unsaved close preserves stored signature',async({page})=>{const {d}=await signature(page);await d.getByRole('button',{name:'清除簽名',exact:true}).click();await d.getByRole('radio',{name:'手寫簽名',exact:true}).check();await d.getByRole('radio',{name:'上傳簽名檔',exact:true}).check();await expect(d.getByAltText('本帳號預設簽名預覽')).toHaveCount(0);await expect(d.getByRole('button',{name:'儲存預設簽名',exact:true})).toBeDisabled();await d.getByRole('button',{name:'關閉電子簽名設定'}).click();await page.getByRole('button',{name:'開啟電子簽名設定'}).click();await expect(page.getByRole('dialog',{name:'電子簽名設定'}).getByAltText('本帳號預設簽名預覽')).toHaveAttribute('src',SAVED);});
test('uploaded replacement remains after mode changes and saves without approving any case',async({page})=>{const {s,d}=await signature(page,false);await d.locator('input[type=file]').setInputFiles({name:'synthetic-signature.png',mimeType:'image/png',buffer:Buffer.from(PNG,'base64')});await expect(d.getByAltText('本帳號預設簽名預覽')).toHaveAttribute('src',SAVED);await d.getByRole('radio',{name:'手寫簽名',exact:true}).check();await d.getByRole('radio',{name:'上傳簽名檔',exact:true}).check();await expect(d.getByAltText('本帳號預設簽名預覽')).toBeVisible();await d.getByRole('button',{name:'儲存預設簽名',exact:true}).click();expect(s.writes).toHaveLength(0);expect(s.tests).toHaveLength(0);});

test('signature method stays in existing documents settings and rejects activation before certificates',async({page},info)=>{const s=await setup(page,{signed:true});await page.goto('/lms/settings/documents');const panel=page.getByRole('region',{name:'簽章方式設定'});await expect(panel.getByRole('radio',{name:/電子簽名圖檔/})).toBeChecked();await panel.getByRole('radio',{name:/數位簽章/}).check();await expect(panel.getByText('尚未啟用數位簽章',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'儲存簽章方式'})).toBeDisabled();expect(s.methodWrites).toHaveLength(0);await captureBrowserEvidence(page,{path:info.outputPath('document-signature-method.png')});await panel.getByRole('radio',{name:/電子簽名圖檔/}).check();await panel.getByRole('button',{name:'儲存簽章方式'}).click();await expect(panel.getByText('簽章方式已儲存。')).toBeVisible();expect(s.methodWrites).toHaveLength(1);expect(s.methodWrites[0].method).toBe('IMAGE');expect(s.errors).toEqual([]);});
test('document signature controls obey current server management permission',async({page})=>{const s=await setup(page,{signed:true});s.methodData.can_manage=false;await page.goto('/lms/settings/documents');const panel=page.getByRole('region',{name:'簽章方式設定'});await expect(panel.getByRole('radio',{name:/數位簽章/})).toBeDisabled();await expect(panel.getByRole('button',{name:'儲存簽章方式'})).toBeDisabled();});

test('port configuration saves through existing documents page, survives reload and never activates signing',async({page},info)=>{
 const s=await setup(page,{signed:true});await page.goto('/lms/settings/documents');
 const panel=page.getByRole('region',{name:'簽章方式設定'});await panel.getByRole('radio',{name:/數位簽章/}).check();
 const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});
 await port.getByLabel('端口名稱',{exact:true}).fill('合成實驗室簽章端口');await port.getByLabel('HTTPS 服務位址').fill('https://signer.example.invalid/dqa');await port.getByLabel('允許連線檢查').check();
 await expect(port.getByRole('button',{name:'檢查端口連線'})).toBeDisabled();
 await port.getByRole('button',{name:'儲存端口設定'}).click();await expect(port.getByText('端口設定已儲存；尚未啟用數位簽章。')).toBeVisible();
 expect(s.portWrites).toHaveLength(1);expect(s.portWrites[0].member_id).toBe(member.id);expect(s.portWrites[0].config.credential_ref).toBe('DQA_SIGNATURE_PORT_TOKEN');
 await port.getByRole('button',{name:'檢查端口連線'}).click();await expect(port.getByText('此端口尚未加入服務端允許清單，未送出連線請求。')).toBeVisible();
 await expect(panel.getByRole('button',{name:'儲存簽章方式'})).toBeDisabled();await expect(port.getByRole('button',{name:'送出報告驗章'})).toBeDisabled();expect(s.methodWrites).toHaveLength(0);expect(s.writes).toHaveLength(0);
 await port.getByLabel('端口名稱',{exact:true}).fill('尚未儲存修改');await expect(port.getByRole('button',{name:'檢查端口連線'})).toBeDisabled();
 await page.reload();await panel.getByRole('radio',{name:/數位簽章/}).check();await expect(port.getByLabel('端口名稱',{exact:true})).toHaveValue('合成實驗室簽章端口');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(s.errors).toEqual([]);
 await port.scrollIntoViewIfNeeded();await captureBrowserEvidence(page,{path:info.outputPath('digital-signature-port.png'),fullPage:true});
});
test('port form rejects credential values and URL tokens before submitting configuration',async({page})=>{
 const s=await setup(page,{signed:true});await page.goto('/lms/settings/documents');await page.getByRole('radio',{name:/數位簽章/}).check();const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});
 await port.getByLabel('端口名稱',{exact:true}).fill('合成端口');await port.getByLabel('HTTPS 服務位址').fill('https://signer.example.invalid/?token=synthetic');
 await port.getByRole('button',{name:'儲存端口設定'}).click();await expect(port.getByRole('alert')).toBeVisible();expect(s.portWrites).toHaveLength(0);
 await port.getByLabel('HTTPS 服務位址').fill('https://signer.example.invalid/dqa');await port.getByLabel('認證設定名稱').fill('synthetic-secret-value');await port.getByRole('button',{name:'儲存端口設定'}).click();expect(s.portWrites).toHaveLength(0);
 expect(await port.locator('input[type=password],input[type=file]').count()).toBe(0);expect(s.errors).toEqual([]);
});
test('provider capability does not unlock digital signing or runtime-disabled report verification',async({page})=>{
 const s=await setup(page,{signed:true});s.portData={...s.portData,configured:true,revision:1,config:{name:'合成端口',connection_type:'HTTPS_GATEWAY',base_url:'https://signer.example.invalid/dqa',auth_mode:'BEARER_TOKEN',credential_ref:'DQA_SIGNATURE_PORT_TOKEN',certificate_ref:'',timeout_seconds:8,timestamp_mode:'PROVIDER_MANAGED',allow_checks:true}};
 s.checkResult={state:'CONNECTED',verification_supported:true,provider_signing_supported:true,digital_ready:false,signing_enabled:false};
 await page.goto('/lms/settings/documents');const panel=page.getByRole('region',{name:'簽章方式設定'});await panel.getByRole('radio',{name:/數位簽章/}).check();const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});
 await port.getByRole('button',{name:'檢查端口連線'}).click();await expect(port.getByText('服務端口可連線；數位簽章仍未啟用。')).toBeVisible();await expect(panel.getByRole('button',{name:'儲存簽章方式'})).toBeDisabled();await expect(port.getByRole('button',{name:'送出報告驗章'})).toBeDisabled();expect(s.methodWrites).toHaveLength(0);
});
test('an unsuccessful recheck clears old connection evidence and disables report verification',async({page})=>{
 const s=await setup(page,{signed:true});s.portData={...s.portData,configured:true,verification_approved:true,revision:1,config:{name:'合成端口',connection_type:'HTTPS_GATEWAY',base_url:'https://signer.example.invalid/dqa',auth_mode:'BEARER_TOKEN',credential_ref:'DQA_SIGNATURE_PORT_TOKEN',certificate_ref:'',timeout_seconds:8,timestamp_mode:'PROVIDER_MANAGED',allow_checks:true}};s.portTargets=[{id:'d1000000-0000-0000-0000-000000000001',name:'合成 PDF 報告',version:1,sha256:'a'.repeat(64)}];s.checkResult={state:'CONNECTED',verification_supported:true};
 await page.goto('/lms/settings/documents');await page.getByRole('radio',{name:/數位簽章/}).check();const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});await port.getByRole('button',{name:'檢查端口連線'}).click();await port.getByLabel('選擇 PDF 報告').selectOption(s.portTargets[0].id);await expect(port.getByRole('button',{name:'送出報告驗章'})).toBeEnabled();
 s.checkError='SIGNATURE_PORT_UNAVAILABLE';await port.getByRole('button',{name:'檢查端口連線'}).click();await expect(port.getByRole('alert')).toContainText('目前無法連線');await expect(port.getByText('服務端口可連線；數位簽章仍未啟用。')).toHaveCount(0);await expect(port.getByRole('button',{name:'送出報告驗章'})).toBeDisabled();
});
test('unauthenticated connection checks never enable document submission',async({page})=>{
 const s=await setup(page,{signed:true});s.portData={...s.portData,configured:true,verification_approved:true,revision:1,config:{name:'合成端口',connection_type:'HTTPS_GATEWAY',base_url:'https://signer.example.invalid/dqa',auth_mode:'NONE',credential_ref:'',certificate_ref:'',timeout_seconds:8,timestamp_mode:'PROVIDER_MANAGED',allow_checks:true}};s.portTargets=[{id:'d1000000-0000-0000-0000-000000000001',name:'合成 PDF 報告',version:1,sha256:'a'.repeat(64)}];s.checkResult={state:'CONNECTED',verification_supported:true};
 await page.goto('/lms/settings/documents');await page.getByRole('radio',{name:/數位簽章/}).check();const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});await port.getByRole('button',{name:'檢查端口連線'}).click();await port.getByLabel('選擇 PDF 報告').selectOption(s.portTargets[0].id);await expect(port.getByRole('button',{name:'送出報告驗章'})).toBeDisabled();await expect(port.getByText('無認證模式只提供連線檢查；驗章需先設定服務端金鑰。')).toBeVisible();expect(s.writes).toHaveLength(0);
});
test('portable development preview needs no network requests after initial document delivery',async({page},info)=>{
 test.skip(!process.env.SIGNATURE_PORT_PREVIEW_FILE,'Portable artifact must be built explicitly');
 // This managed browser disallows file: navigation. Deliver the exact built file through
 // a locally intercepted document request; CSP still prohibits all subsequent networking.
 const url=new URL('/__local-signature-port-preview.html',test.info().project.use.baseURL).href,html=await readFile(process.env.SIGNATURE_PORT_PREVIEW_FILE,'utf8');
 await page.route(url,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
 const requests=[],errors=[];page.on('request',r=>{if(r.url()!==url)requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await expect(page.getByText('開發預覽 · 隔離測試資料',{exact:true})).toBeVisible();
 await page.getByRole('radio',{name:/數位簽章/}).check();const port=page.getByRole('region',{name:'數位簽章服務端口',exact:true});
 await port.getByLabel('端口名稱',{exact:true}).fill('離線預覽端口');await port.getByLabel('HTTPS 服務位址').fill('https://signer.example.invalid/dqa');await port.getByLabel('允許連線檢查').check();await port.getByRole('button',{name:'儲存端口設定'}).click();await expect(port.getByText('端口設定已儲存；尚未啟用數位簽章。')).toBeVisible();
 await port.getByRole('button',{name:'檢查端口連線'}).click();await expect(port.getByText('此端口尚未加入服務端允許清單，未送出連線請求。')).toBeVisible();
 await page.reload();await page.getByRole('radio',{name:/數位簽章/}).check();await expect(port.getByLabel('端口名稱',{exact:true})).toHaveValue('離線預覽端口');expect(requests).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await captureBrowserEvidence(page,{path:info.outputPath('portable-preview.png'),fullPage:true});
});
