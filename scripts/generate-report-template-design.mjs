import fs from 'node:fs/promises';
import {defaultTrialCatalog} from '../src/trialCatalogStore.mjs';
import {makeTrialTemplateWorkbook,trialTemplateName} from '../src/trialTemplateWorkbook.mjs';
import {requestWorkbookBytes} from '../src/requestDocumentWorkbook.mjs';
import {excelModule} from '../src/reportWorkbook.mjs';
import {reportToPdf} from '../src/reportPdf.mjs';
import {addRequestForm,addTrialReportForms} from '../src/labFormLayout.mjs';
const out=new URL('../../deliverables/',import.meta.url);await fs.mkdir(new URL('excel/',out),{recursive:true});
const assets=Object.fromEntries(await Promise.all(Object.entries({logo:'public/branding/colong-ie-transparent.png',footer:'public/branding/colong-intellienergy-logo.jpg',sample:'public/demo-report-images/synthetic-sample.png',placement:'public/demo-report-images/synthetic-placement.png'}).map(async([k,p])=>[k,new Uint8Array(await fs.readFile(p))])));
const fontBytes=await fs.readFile('public/fonts/NotoSansCJKtc-Regular.otf'),blank=await requestWorkbookBytes({},{assets});
await fs.writeFile(new URL('excel/00_空白電子委託單.xlsx',out),blank);await fs.writeFile(new URL('01_空白委託單_版面預覽.pdf',out),await reportToPdf(blank,{fontBytes}));
const catalog=defaultTrialCatalog();for(const [i,row] of catalog.entries()){await fs.writeFile(new URL('excel/'+String(i+1).padStart(2,'0')+'_'+trialTemplateName(row),out),await makeTrialTemplateWorkbook(row,{assets}));console.log(JSON.stringify({template:i+1,name:row.name}));}
const Excel=await excelModule();for(const [name,file]of [['高溫高濕','02_高溫高濕250H_委託與報告示意'],['振動試驗','03_振動三顆_委託與報告示意']]){
 const row=catalog.find(r=>r.name===name),request={id:'REQ-2026-999',productCode:'SYNTH-MODULE-001',productType:'合成電子模組',customer:'合成展示客戶',requester:'Demo 委託者',quantity:3,dueDate:'2026-12-10',productVersion:'DEMO-DV',sampleSpaceUnits:1,testItems:[name],specification:row.specification,judgementCriteria:row.acceptance,notes:'版面設計示意，沒有真實試驗數據或簽名。',execution:{sampleCode:'SMP-DEMO-001～003',equipment:row.equipment}};
 const book=new Excel.Workbook();addRequestForm(book,request,row,assets);const {cover}=addTrialReportForms(book,row,{request,assets,demo:true});for(const [cell,text]of [['C55','承認簽名位置（示意）'],['F55','確認簽名位置（示意）'],['I55','作成簽名位置（示意）']])cover.getCell(cell).value=text;
 const bytes=new Uint8Array(await book.xlsx.writeBuffer());await fs.writeFile(new URL(file+'.xlsx',out),bytes);await fs.writeFile(new URL(file+'.pdf',out),await reportToPdf(bytes,{fontBytes,templatePreview:true,requestId:request.id}));
}
await fs.writeFile(new URL('範本說明.txt',out),'內容：1 份空白委託單、20 份對應試驗的 Excel 範本，另附 2 份填入合成資料的版面示意。\n所有範本的量測值與簽名留白。圖片為 AI 生成合成 Demo 圖，不是實拍、曝露證據或合格證明。\n環境箱擺放圖只用於溫濕度／環境箱類試驗，其餘試驗的設備配置照片留白待補。\n20 項規範、工時、設備與步驟取自既有 Demo 目錄；不是核准正式標準。\n簽名位置：委託單左主管、右委託者；報告由左到右承認、確認、作成。\n本輪未 Commit、Push 或部署。上傳範本保存於同一網站的目前瀏覽器，非雲端文件庫。\n');
