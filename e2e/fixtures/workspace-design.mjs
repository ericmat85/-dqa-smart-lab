import {PROFILE_DEFAULTS} from '../../src/workspaceProfile.mjs';
import {BUSINESS_MODEL_CATALOG} from '../../src/businessModelCatalog.mjs';
import {defaultTrialCatalog} from '../../src/trialCatalogStore.mjs';
const id=n=>'ad000000-0000-4000-8000-'+String(n).padStart(12,'0');
export async function workspaceFixture(page,{dark=false,requester=false,snapshotPatch={}}={}){
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:'/* Deterministic system-font fallback for local browser verification. */'}));
 await page.route('https://fonts.gstatic.com/**',route=>route.abort());
 const state={errors:[],writes:[]};page.on('pageerror',e=>state.errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/two children with the same key/.test(message.text()))state.errors.push(message.text());});await page.addInitScript(dark=>{localStorage.setItem('dqa-global-theme',dark?'dark':'light');},dark);
 const role={id:id(50),code:'preview-admin',name:'工作區管理者',is_tenant_admin:true,enabled:true,revision:1,review_level:0,permissions:[],systems:['lms','lab','request'],pages:['dashboard','requests','schedule','equipment','maintenance','finance','reports','archive','settings']};
 const member={id:id(1),display_name:'設計預覽管理者',name:'設計預覽管理者',login_email:'preview@example.invalid',email:'preview@example.invalid',enabled:true,role_id:role.id,department:'研發部',activation:'ACTIVE',revision:1};
 const equipment={id:id(2),legacy_id:'EQ-014',name:'防水試驗機 #01',category:'防護試驗',model:'WATER-X6',space_units:6,daily_hours:24,operational_status:'IDLE',revision:1,display_details:{location:'合成實驗室',owner:'合成工程師'}};
 const material={id:id(3),legacy_id:'MAT-019',name:'防靜電工作墊',category:'治具配件',unit:'張',total_quantity:6,available_quantity:4,min_stock:1,status:'AVAILABLE',revision:1,display_details:{owner:'合成工程師',location:'合成工具櫃'}};
 const requests=[1,2,3].map((n)=>({id:id(10+n),legacy_id:'REQ-2026-00'+n,owner_member_id:id(1),status:'AWAITING_LMS_REVIEW',revision:1,product_code:'VCU-A0'+n,customer_name:'合成客戶',quantity:1,form_details:{testItems:['高溫高濕']},created_at:'2026-11-24T00:00:00Z'}));
 await page.route('**/api/**',async route=>{const q=route.request(),path=new URL(q.url()).pathname.replace('/api/business',''),send=data=>route.fulfill({json:{data}});if(q.method()!=='GET'){state.writes.push(path);return route.fulfill({status:403,json:{error:{code:'DESIGN_PREVIEW_READ_ONLY'}}});}
 if(path==='/trial-templates')return send({trials:defaultTrialCatalog().map((t,i)=>({id:id(100+i),legacy_id:t.id,name:t.name,aliases:t.aliases,file_id:null,revision:0})),files:[],can_manage:true});
 if(path==='/trial-templates/inbox')return send({rows:[]});
 if(path.startsWith('/trial-templates/request/'))return send({has_template:false});
 if(path==='/templates/blank')return send({rows:[],builtin_visible:true,revision:0,can_manage:true,source:'DATABASE'});
 if(path==='/maintenance')return send({counts:{},choices:[],runs:[]});
 if(path==='/signature-settings'){const section=new URL(q.url()).searchParams.get('section');return send(section==='port'?{can_manage:true,revision:0,configured:false,config:null,verification_approved:false,digital_ready:false,signing_enabled:false}:section==='targets'?[]:{method:'IMAGE',revision:0,digital_ready:false,can_manage:true});}
 if(path==='/images')return send({member_id:member.id,can_manage:true,images:Object.fromEntries(['logo','avatar','signature'].map(kind=>[kind,{image:null,name:'',revision:0}]))});
 if(path==='/me')return route.fulfill({json:{user:{id:id(1),email:'synthetic@example.invalid'},member:{...member,is_admin:true,systems:['lms','lab','request'],pages:['dashboard','requests','schedule','equipment','maintenance','finance','reports','archive','settings'],permissions:['requests.draft',...(requester?[]:['requests.review_manager']),'lab.execute','finance.read','finance.write']}}});
 if(path==='/snapshot')return send({members:[member],roles:[role,{id:id(51),name:'實驗室工程師',enabled:true}],trials:defaultTrialCatalog().map((t,i)=>({id:id(100+i),legacy_id:t.id,name:t.name,aliases:t.aliases,profile_code:t.profileId,specification:t.specification,acceptance:t.acceptance,equipment_reference:t.equipment,specification_version:t.version,duration_hours:t.durationHours,source_kind:'SYNTHETIC',enabled:true,revision:1})),requests,equipment:[equipment],materials:[material],schedules:[],schedule_executors:[{id:id(60),role_id:id(51),display_name:'示範工程師',enabled:true}],allocations:[],borrows:[],operations:[],resource_events:[],reports:[],quality:[],qualifications:[],sites:[],departments:[],equipment_activity:{available:true,configuration:{equipmentDays:14,equipmentStart:'',usageDays:30},rows:[{id:id(2),days:30,rate:3.3,occupied_seconds:86400}]},...snapshotPatch});
 if(path==='/finance/context')return send({can_edit:true,requests:[],equipment:[],projects:[],service_events:[]});
 if(path==='/finance/snapshot')return send({costs:[],vouchers:[],count:0,voucher_count:0,totals:[],annual:[],year:2026});
 if(path==='/resources/settings')return send({configuration:{equipmentDays:14,equipmentStart:'',usageDays:30},can_manage:true,revision:0});
 if(path==='/access'&&new URL(q.url()).searchParams.get('section')==='appearance')return send({configuration:{tabBarColor:'#142D48',tableHeaderColor:'#D2DCE8'},can_manage:true,revision:0});
 if(path==='/access'&&new URL(q.url()).searchParams.get('section')==='profile')return send({configuration:{...PROFILE_DEFAULTS,workspaceName:'DQA Smart Lab',labName:'COLONG 實驗室'},can_manage:true,revision:1});
 if(path==='/access')return send({members:[member],roles:[role],departments:[],source:'DATABASE'});
 if(path==='/notifications/status')return send({settings:{service_ready:true,service_enabled:true},counts:{QUEUED:0,SENT:0,FAILED:0,UNKNOWN:0},records:[]});
 if(path==='/notifications/settings')return send({member_id:id(1),configured:true,enabled:true,revision:1,service_ready:true,service_enabled:true});
 if(path==='/ai/status')return send({engines:Object.fromEntries(['E1','E2','E3','E4'].map(engine=>[engine,{ready:true,model:'gpt-6-luna',available_usd:'0.98',per_call_usd:'0.05',code:'PREVIEW_ONLY'}])),observations:{records:[]}});
 const engine=path.match(/^\/ai\/settings\/(E[1-4])$/)?.[1];if(engine)return send({engine,can_manage:true,revision:1,enabled:true,model:'gpt-6-luna',allowed_models:['gpt-6-luna','gpt-6-sol'],models:BUSINESS_MODEL_CATALOG.models.map(row=>({...row,available:true,selectable:row.compatible,contract_reason:row.reason})),key_configured:true,key_mask:'••••••••DEMO',key_mode:'INHERIT',per_call_usd:'0.05',total_cap_usd:'1',max_output_tokens:768,limits:{per_call_usd:'0.05',total_cap_usd:'1',max_output_tokens:768},usage:{spent_usd:'0.02',held_usd:'0'},engine_controls:{},model_call_performed:false});return send([]);
 });return state;
}
