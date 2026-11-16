import {addRequestForm,addTrialReportForms,formAssets} from './labFormLayout.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {readTrialCatalog} from './trialCatalogStore.mjs';
import {INITIAL_ACCOUNTS} from './demoAccounts.mjs';
import {canOpenReportArchive} from './reportArchive.mjs';
import profiles from '../render-backend/gateway/trial_profiles.json' with {type:'json'};
export function trialTemplateName(row){return `${row.name}-試驗範本-${row.version}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^\.+/,'').slice(0,160)+'.xlsx';}
function authorize({actorId,system,templateId,expectedRevision},storage){
 let accounts;try{accounts=JSON.parse(storage.getItem('dqa-shared-demo-accounts-v1')||JSON.stringify(INITIAL_ACCOUNTS));}catch{throw Error('帳號資料無法讀取，拒絕提供範本。');}
 const actor=Array.isArray(accounts)&&accounts.find(a=>a.id===actorId);if(!canOpenReportArchive(actor,system,storage))throw Error('目前帳號沒有資料庫範本查閱權限。');
 const catalog=readTrialCatalog(storage),row=catalog.rows.find(r=>r.id===templateId);if(!row||expectedRevision!==undefined&&expectedRevision!==catalog.revision)throw Error('範本資料已更新，請重新開啟預覽或下載。');return {row,revision:catalog.revision};
}
export function assertTrialTemplateAccess(options,storage=globalThis.localStorage){return authorize(options,storage);}
export async function makeTrialTemplateWorkbook(row,{assets}={}){
 if(!row||row.synthetic!==true||!row.id||!row.name||!row.version||!Number.isFinite(row.durationHours))throw Error('範本來源無法核對。');
 if(!assets&&typeof window!=='undefined')assets=await formAssets();
 const Excel=await excelModule(),book=new Excel.Workbook();book.creator='DQA Smart Lab Demo';
 const info=book.addWorksheet('範本資訊'),record=book.addWorksheet('試驗紀錄');for(const s of [info,record])s.columns=[20,22,22,22,22,22].map(width=>({width}));
 const profile=profiles.profiles.find(p=>p.id===row.profileId),calendar=profile?(profile.calendar==='weekdays'?'平日作業，週末不作業':'可連續跨週末'):'尚未設定排程規則';
 let cursor=1;
 function field(label,value){const lines=String(value??'').split('\n');let first=true;for(const line of lines){const chars=Array.from(line);for(let i=0;i<Math.max(1,chars.length);i+=180){info.getCell(cursor,1).value=first?label:'（續）';info.mergeCells(cursor,2,cursor,6);info.getCell(cursor,2).value=chars.slice(i,i+180).join('');info.getRow(cursor).height=72;first=false;cursor++;}}}
 field('試驗範本',row.name);field('內容狀態','合成 Demo 參考內容；非核准正式試驗規範。');field('範本編號',row.id);field('規範版本',row.version);field('試驗工時（小時）',row.durationHours);field('適用設備',row.equipment);field('作業日規則',calendar);field('試驗規範／手法',row.specification);field('判定參考',row.acceptance);
 const fields=[['試驗紀錄（空白範本）',row.name],['規範版本',row.version],['委託編號',''],['樣品編號',''],['設備編號',''],['執行人員',''],['實際開始時間',''],['實際完成時間',''],['量測結果',''],['外觀／功能確認',''],['結果判定',''],['異常與處置',''],['作成簽名',''],['審核簽名',''],['核准簽名','']];
 for(const [i,[label,value]]of fields.entries()){const n=i+1;record.getCell(n,1).value=label;record.mergeCells(n,2,n,6);record.getCell(n,2).value=String(value);record.getRow(n).height=n>8?48:30;}
 for(const sheet of [info,record]){sheet.eachRow({includeEmpty:true},r=>r.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:11,color:{argb:'FF182B42'}};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:'FFDCE4EF'}}};if(cell.col===1){cell.font.bold=true;cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF4FC'}};}}));sheet.views=[{state:'frozen',ySplit:2}];sheet.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};}
 info.orderNo=90;record.orderNo=91;
 const formRow={...row};addRequestForm(book,{},formRow,assets);addTrialReportForms(book,formRow,{assets});
 return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function readTrialTemplateFile(options,storage=globalThis.localStorage,{build=makeTrialTemplateWorkbook}={}){
 const first=authorize(options,storage),bytes=await build(first.row),last=authorize({...options,expectedRevision:first.revision},storage);
 if(JSON.stringify(last.row)!==JSON.stringify(first.row))throw Error('範本資料已更新，請重新預覽或下載。');return {bytes,name:trialTemplateName(last.row),row:last.row,revision:last.revision};
}
