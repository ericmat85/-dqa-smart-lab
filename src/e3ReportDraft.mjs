import {excelModule} from './reportWorkbook.mjs';
import {buildManagementExport} from './managementExport.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {canAccessLmsPage} from './customRoles.mjs';
import {accessSystem} from './demoPermissions.mjs';
export function e3SourceStamp({columns,rows,scope=''}){
 try{if(!Array.isArray(columns)||columns.length>24||!Array.isArray(rows)||rows.length>5000)return null;return JSON.stringify({columns:columns.map(c=>({key:c.key,label:c.label})),rows:rows.map(r=>Object.fromEntries(columns.map(c=>[c.key,r[c.key]??'']))),scope});}catch{return null;}
}
export function authorizeE3Export(storage=globalThis.localStorage,session=globalThis.sessionStorage){
 let accounts;try{accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS));}catch{throw Error('無法核對報表存取權限。');}const actor=Array.isArray(accounts)&&accounts.find(a=>a.id===session.getItem('dqa-lms-account-id'));if(!accessSystem(actor,'lms',storage)||!canAccessLmsPage(actor,'reports',storage))throw Error('目前帳號沒有報表匯出權限。');return actor.id;
}
export function makeE3Draft({title,purpose='',kind='MANAGEMENT',columns,rows,scope='',sectionTitles=[],now=Date.now()}){
 if(typeof title!=='string'||!title.trim()||title.length>40||typeof purpose!=='string'||purpose.length>4000||!['MANAGEMENT','SPECIAL'].includes(kind)||!Array.isArray(columns)||!columns.length||columns.length>24||!Array.isArray(rows)||rows.length>5000||!Array.isArray(sectionTitles)||sectionTitles.length>8||sectionTitles.some(s=>typeof s!=='string'||!s.trim()||s.length>60))throw Error('客製報告設定無效或超過安全上限。');
 if(columns.some(c=>!c||(!/^\w{1,60}$/.test(c.key)||['__proto__','constructor','prototype'].includes(c.key))||typeof c.label!=='string'||!c.label||c.label.length>80)||new Set(columns.map(c=>c.key)).size!==columns.length)throw Error('報表欄位無法核對。');
 const clean=rows.map(row=>Object.fromEntries(columns.map(c=>{const v=row[c.key]??'';if(!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||String(v).length>6000)throw Error('來源欄位過長或格式無法核對；未截斷資料。');return [c.key,v];})));
 if(new TextEncoder().encode(JSON.stringify(clean)).length>4*1024*1024)throw Error('來源資料超過單次草稿上限，請縮小篩選範圍；未截斷資料。');
 const states=Object.create(null);for(const row of rows){const state=typeof row.status==='string'?row.status:'未提供狀態';states[state]=(states[state]||0)+1;}
 const missing=columns.map(c=>({name:c.label,count:clean.filter(r=>r[c.key]==='').length})).filter(x=>x.count);
 const sections=[{title:'報告目的',text:purpose||'尚未填寫報告目的。'},{title:'資料範圍',text:`${scope}\n來源資料 ${rows.length} 列；產生時間 ${new Date(now).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}（台灣時間）。`},{title:'狀態分佈',text:Object.entries(states).map(([s,n])=>`${s}：${n} 列`).join('；')||'目前沒有來源資料。'},{title:'待補資料',text:missing.map(x=>`${x.name}：${x.count} 列未提供`).join('；')||'所選欄位均有來源值；不代表內容已完成正式驗證。'},...sectionTitles.map(title=>({title,text:'尚未提供內容；保留空白待填寫。'}))];
 if(kind==='SPECIAL')sections.push({title:'試驗證據與正式簽核',text:'只引用已提供的來源。未提供的實測數據、合格判定與簽名不會自動生成；此檔為特殊報告草稿。'});
 return {engine:'E3',mode:'RULE_BASED_DRAFT',real_ai:false,provider:'NONE',provider_status:'E3_PROVIDER_NOT_ENABLED',trace_id:'I-'+crypto.randomUUID().replaceAll('-',''),title:title.trim(),kind,columns:columns.map(c=>({...c})),rows:clean,sections,rowCount:clean.length,writes:'NONE',source:'CURRENT_FILTERED_BROWSER_DATA',official_status:'DRAFT_ONLY',observedAt:now};
}
export async function buildE3Export(draft,type,{fontBytes}={}){
 if(draft?.engine!=='E3'||draft.mode!=='RULE_BASED_DRAFT'||draft.real_ai!==false||draft.official_status!=='DRAFT_ONLY')throw Error('報告草稿來源無法核對。');
 if(type==='pdf')return buildManagementExport({type,title:draft.title+'（草稿）',columns:[{key:'section',label:'章節／來源列'},{key:'content',label:'內容'}],rows:[...draft.sections.map(s=>({section:s.title,content:s.text})),...draft.rows.map((r,i)=>({section:'來源資料列 '+(i+1),content:draft.columns.map(c=>c.label+'：'+String(r[c.key]??'未提供')).join('\n')}))],summary:'來源資料草稿；未呼叫 AI 模型。',fontBytes});
 if(type!=='xlsx')throw Error('不支援的報告格式。');const Excel=await excelModule(),book=new Excel.Workbook();book.creator='DQA Smart Lab Demo';const notes=book.addWorksheet('客製報告草稿');notes.columns=[{width:25},{width:110}];
 const fields=[['報告名稱',draft.title],['草稿狀態','資料草稿；未呼叫 AI 模型，尚未正式簽核。'],['來源資料列數',String(draft.rowCount)],...draft.sections.map(s=>[s.title,s.text])];
 for(const [label,text]of fields){let first=true;for(const line of String(text).split('\n')){const chars=Array.from(line);for(let i=0;i<Math.max(1,chars.length);i+=180){const row=notes.addRow([first?label:'（續）',chars.slice(i,i+180).join('')]);row.height=60;row.alignment={vertical:'top',wrapText:true};first=false;}}}
 const data=book.addWorksheet('來源資料');data.columns=draft.columns.map(c=>({header:c.label,key:c.key,width:24}));draft.rows.forEach(r=>data.addRow(r));data.views=[{state:'frozen',ySplit:1}];data.getRow(1).font={bold:true};notes.getColumn(1).font={bold:true};return new Uint8Array(await book.xlsx.writeBuffer());
}
