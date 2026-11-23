const role=(name,permissions,systems,pages,review_level=0)=>({name,permissions,systems,pages:['dashboard',...pages],review_level,enabled:true,is_tenant_admin:false});
export const HUMAN_ROLE_PRESETS=[
 role('委託者',['requests.draft','requests.submit','catalog.read'],['request'],['requests','archive']),
 role('委託者主管',['requests.review_manager','reports.confirm','catalog.read','reports.read_all'],['request'],['requests','archive']),
 role('一階主管',['requests.review_lms','requests.read_all','catalog.read','equipment.read','schedules.read_all','schedules.plan','schedules.book','reports.read_all'],['lms'],['requests','schedule','equipment','archive'],1),
 role('二階主管',['requests.review_lms','reports.review','requests.read_all','reports.read_all','catalog.read'],['lms'],['requests','archive'],2),
 role('三階主管',['reports.review','requests.read_all','reports.read_all','catalog.read'],['lms'],['requests','archive'],3),
 role('實驗室工程師',['lab.execute','reports.submit','equipment.read','materials.read','catalog.read','reports.read_all'],['lab'],['requests','equipment','maintenance','reports','archive'])
];
export function humanAccountReadiness(directory){const active=(directory.members||[]).filter(m=>m.enabled&&m.activation==='ACTIVE'),roles=directory.roles||[],matches=(cap,level)=>active.filter(m=>{const r=roles.find(r=>r.id===m.role_id);return r?.enabled&&(r.is_tenant_admin||r.permissions.includes(cap))&&(level===undefined||r.review_level===level);});return [['已啟用帳號',active.length],['已指派直屬主管',active.filter(m=>m.supervisor_id&&active.some(s=>s.id===m.supervisor_id&&s.id!==m.id)).length],['LMS 一階主管',matches('requests.review_lms',1).length],['LMS 二階主管',matches('requests.review_lms',2).length],['報告三階主管',matches('reports.review',3).length],['實驗室執行人',matches('lab.execute').length]];}
