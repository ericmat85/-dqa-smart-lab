import {test,expect} from '@playwright/test';
const member={id:'a2000000-0000-0000-0000-000000000002',display_name:'合成管理者',role_name:'管理者',is_admin:true,permissions:['requests.draft']};
async function setup(page,{signed=false}={}){
 const state={signed,rows:[],writes:[],conflict:false,unknown:false,reads:0,errors:[],prefs:{member_id:member.id,enabled:false,configured:true,revision:1,service_enabled:true,service_ready:true},mailWrites:[],tests:[]};page.on('pageerror',error=>state.errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('dqa-request-demo-v2','OLD_BROWSER_DATA_DO_NOT_CHANGE');localStorage.setItem('dqa-shared-demo-accounts-v1','OLD_ACCOUNTS_DO_NOT_CHANGE');});
 await page.route('**/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON(),send=(data,status=200)=>route.fulfill({status,json:{...data,trace_id:'I-SYNTHETIC'}});
 if(!path.startsWith('/api/business/'))return send({error:{code:'LIVE_PROVIDER_DISABLED'}},403);
 const endpoint=path.slice('/api/business'.length);
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
test('notification preference persists through API and reload on original desktop/mobile profile',async({page,isMobile},info)=>{const s=await setup(page,{signed:true});await page.goto('/request/dashboard');let d=await personal(page);await expect(d.getByText(/通知開關尚未連接/)).toHaveCount(0);await expect(d.getByRole('switch',{name:'電子郵件通知'})).toHaveAttribute('aria-checked','false');await d.getByRole('switch',{name:'電子郵件通知'}).click();await d.getByRole('button',{name:'儲存設定',exact:true}).click();await expect(d).toHaveCount(0);expect(s.mailWrites).toHaveLength(1);await page.reload();d=await personal(page);await expect(d.getByRole('switch',{name:'電子郵件通知'})).toHaveAttribute('aria-checked','true');await expect(d.getByRole('button',{name:'寄送測試信'})).toHaveCount(0);await page.screenshot({path:info.outputPath('personal-email.png')});expect(s.tests).toHaveLength(0);expect(s.errors).toEqual([]);if(isMobile)expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);});
test('system administration shows database mail readiness and delivery counts',async({page})=>{const s=await setup(page,{signed:true});await page.goto('/lms/settings/notifications');await expect(page.getByRole('heading',{name:'電子郵件寄送狀態'})).toBeVisible();await expect(page.getByText(/郵件服務已連線/)).toBeVisible();expect(s.errors).toEqual([]);});
