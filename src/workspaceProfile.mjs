export const PROFILE_FIELDS={workspaceName:'工作區顯示名稱',dateFormat:'顯示日期格式',timeZone:'顯示時區',labName:'實驗室名稱',address:'地址',phone:'電話',email:'電子郵件',website:'網站',identifier:'許可／認證識別（選填）',qualityLead:'品質主管（資訊）',technicalLead:'技術主管（資訊）'};
export const PROFILE_DEFAULTS={workspaceName:'',dateFormat:'YYYY/MM/DD',timeZone:'Asia/Taipei',labName:'',address:'',phone:'',email:'',website:'',identifier:'',qualityLead:'',technicalLead:''};
export function validateWorkspaceProfile(value){
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==Object.keys(PROFILE_DEFAULTS).length)throw Error('WORKSPACE_PROFILE_FIELDS_INVALID');
 for(const [key,v] of Object.entries(value))if(!Object.hasOwn(PROFILE_DEFAULTS,key)||typeof v!=='string'||v.length>300||[...v].some(c=>c.charCodeAt(0)<32))throw Error('WORKSPACE_PROFILE_FIELDS_INVALID');
 if(!value.workspaceName.trim()||!['YYYY/MM/DD','YYYY-MM-DD','DD/MM/YYYY'].includes(value.dateFormat)||!['Asia/Taipei','UTC','America/New_York','Europe/London','Asia/Tokyo'].includes(value.timeZone))throw Error('WORKSPACE_PROFILE_FIELDS_INVALID');
 if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))throw Error('WORKSPACE_PROFILE_FIELDS_INVALID');
 if(value.website&&!/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(value.website))throw Error('WORKSPACE_PROFILE_FIELDS_INVALID');
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v.trim()]));
}
export function formatProfileDate(value,profile){
 try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:profile.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return profile.dateFormat.replace('YYYY',p.year).replace('MM',p.month).replace('DD',p.day);}catch{return '—';}
}
