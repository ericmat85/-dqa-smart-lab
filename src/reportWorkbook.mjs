import {generalProfile,inspectGeneralReport,refreshHeaderReferences,isGeneralRequest,GENERAL_COVER,GENERAL_DETAIL,GENERAL_PAGE_ENDS} from './reportProfiles.mjs';
import {reportBounds,cellText,normalizeReportMerges} from './reportLayout.mjs';
import {DEFAULT_SIGNATURE_CELLS} from './reportRules.mjs';
export async function excelModule(){const module=await import('exceljs/dist/exceljs.min.js');return module.default;}
export async function createReportTemplate(request={},demo=false,{templateBytes}={}){
 if(isGeneralRequest(request))return createGeneralTemplate(request,demo,templateBytes);
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('試驗報告');
 sheet.columns=[12,12,12,12,12,12,12,12,12].map(width=>({width}));
 sheet.mergeCells('A1:I1');sheet.getCell('A1').value=`DQA SMART LAB｜${(request.testItems||[]).includes('一般性能試驗')?'一般性能試驗報告':'通常試驗報告'}（Demo）`;sheet.getCell('A1').font={size:18,bold:true};sheet.getRow(1).height=32;
 sheet.mergeCells('A2:I2');sheet.getCell('A2').value=demo?'DEMO 流程展示資料，非正式試驗結果。':'請依委託內容與實際試驗紀錄填寫。';
 const fields=[['委託編號',request.id,'產品名稱',request.productCode||request.product],['試驗項目',(request.testItems||[]).join('、'),'報告編號',request.id?`RPT-${request.id}`:''],['設備',request.execution?.equipment,'樣品數量',request.quantity],['試驗條件',demo?'DEMO 高溫儲存流程驗證':'','試驗時數',request.execution?.hours||''],['開始時間',request.execution?.plannedStart,'結束時間',request.execution?.completedAt],['試驗依據',request.specification,'測試人員',request.execution?.operator]];
 fields.forEach(([a,b,c,d],index)=>{const row=index+4;sheet.getCell(`A${row}`).value=a;sheet.mergeCells(`B${row}:C${row}`);sheet.getCell(`B${row}`).value=b||'';sheet.getCell(`D${row}`).value=c;sheet.mergeCells(`E${row}:I${row}`);sheet.getCell(`E${row}`).value=d||'';});
 sheet.getRow(11).values=['樣品編號','外觀檢查','功能檢查','試驗結果','備註','判定'];
 if(demo)sheet.getRow(12).values=[request.execution?.sampleCode||'SAMPLE-DEMO','DEMO 正常','DEMO 正常','DEMO 完成','僅供流程測試','DEMO 合格'];
 for(const [row,label,value]of [[16,'試驗結果摘要',demo?'DEMO：試驗流程完成，結果供系統功能展示。':''],[17,'異常紀錄',demo?'DEMO 無異常':'']]){sheet.getCell(`A${row}`).value=label;sheet.mergeCells(`B${row}:I${row}`);sheet.getCell(`B${row}`).value=value;sheet.getRow(row).height=36;}
 sheet.getCell('A18').value='填寫人';sheet.mergeCells('B18:C18');sheet.getCell('B18').value=request.execution?.operator||'';sheet.getCell('D18').value='報告日期';sheet.mergeCells('E18:F18');sheet.getCell('E18').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 sheet.mergeCells('A20:C20');sheet.getCell('A20').value='承認：三階主管';sheet.mergeCells('D20:F20');sheet.getCell('D20').value='確認：二階主管';sheet.mergeCells('G20:I20');sheet.getCell('G20').value='作成：執行人員';sheet.getRow(21).height=60;sheet.getRow(22).height=28;
 sheet.mergeCells('A24:I24');sheet.getCell('A24').value='Demo 圖片簽名：無正式電子簽章效力；此為簡化展示版型。';

 sheet.eachRow({includeEmpty:true},row=>{row.eachCell({includeEmpty:true},cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.border={top:{style:'thin',color:{argb:'FFDCE4EF'}},bottom:{style:'thin',color:{argb:'FFDCE4EF'}},left:{style:'thin',color:{argb:'FFDCE4EF'}},right:{style:'thin',color:{argb:'FFDCE4EF'}}};});if(!row.height)row.height=24;});
 sheet.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:I24'};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function inspectReport(bytes,requestId,fileName,request){
 const checks=[];if(!/\.xlsx$/i.test(fileName))throw Error('請使用 .xlsx 檔案；舊 .xls 請先另存為 .xlsx。');if(bytes.byteLength>10*1024*1024)throw Error('檔案上限為 10 MB。');
 const Excel=await excelModule(),book=new Excel.Workbook();try{await book.xlsx.load(bytes);}catch{throw Error('無法讀取 Excel，檔案可能損壞、加密或格式不正確。');}
 const sheet=book.worksheets.find(row=>row.state==='visible'||!row.state);if(!sheet)throw Error('報告沒有可讀取的工作表。');
 if(/篩檢條件|生成來源|上傳作業說明/.test(fileName))throw Error('這是規則／篩檢條件參考表，並非已填寫的試驗報告。請使用「下載本案 Excel 範本」填寫後上傳。');
 book.eachSheet(ws=>reportBounds(ws));
 const profile=generalProfile(book);
 if(profile){refreshHeaderReferences(book);checks.push(...inspectGeneralReport(book,requestId,request));}
 else{
 if(!cellText(sheet.getCell('A1')).includes('DQA SMART LAB｜'))throw Error('目前支援一般性能雙工作表範本及本案簡化 Demo 範本。請使用「下載本案 Excel 範本」，並保留工作表名稱、欄位與簽名區結構；此檔版型無法安全套用簽名。');
 const id=String(cellText(sheet.getCell('B4'))||'').trim();checks.push({label:'委託編號一致',ok:id===requestId,detail:id||'B4 尚未填寫'});
 const result=String(cellText(sheet.getCell('B16'))||'').trim()||String(cellText(sheet.getCell('D12'))||'').trim();checks.push({label:'試驗結果已填寫',ok:Boolean(result),detail:result?'已填寫結果／摘要':'請填寫 B16 結果摘要或 D12 試驗結果'});
 }
 let uncached=false,external=false,formulaError=false;book.eachSheet(ws=>ws.eachRow(row=>row.eachCell(cell=>{if(cell.value&&typeof cell.value==='object'&&cell.value.formula){if(cell.value.result===undefined)uncached=true;if(cell.value.result?.error)formulaError=true;if(/\[[^\]]+\]/.test(cell.value.formula))external=true;}})));
 checks.push({label:'公式無錯誤值',ok:!formulaError,detail:formulaError?'請修正 #REF!、#VALUE! 等公式錯誤後重新上傳':'通過'});
 checks.push({label:'公式具有已計算結果',ok:!uncached,detail:uncached?'請用 Excel 計算並儲存檔案後重新上傳':'通過'});checks.push({label:'無外部活頁簿公式連結',ok:!external,detail:external?'請移除外部檔案公式連結':'通過'});
 return {ok:checks.every(row=>row.ok),checks,sheetName:profile?.sheetName||sheet.name,profileId:profile?.id||'demo-simple-v1',cells:profile?.cells||{...DEFAULT_SIGNATURE_CELLS},engine:'Demo 規則式防呆檢查'};
}
export async function stampReport(bytes,{sheetName,cells=DEFAULT_SIGNATURE_CELLS,level,signature,actor,at}){
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('主管電子簽名為必填。');
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);normalizeReportMerges(book);const profile=generalProfile(book);if(profile)refreshHeaderReferences(book);const sheet=book.getWorksheet(sheetName);if(!sheet)throw Error('指定工作表不存在。');
 const target=level==='executor'?cells.executor:cells[`level${level}`];if(!/^[A-Z]{1,2}\d{1,4}$/.test(target||''))throw Error('簽名位置格式錯誤。');const cell=sheet.getCell(target);if(cell.row<20||cell.row>1998||cell.col>48)throw Error('簽名位置須在第 20 列以後，避免覆蓋報告內容。');
 for(const address of Object.values(cells).filter(address=>address!==target)){const other=sheet.getCell(address);if(Math.abs(cell.col-other.col)<3&&Math.abs(cell.row-other.row)<2)throw Error('三方簽名位置不可重疊。');}
 if(level==='executor'&&!profile)sheet.getCell('E18').value=new Date(at).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 if(profile){
  const expected=profile.cells[level==='executor'?'executor':`level${level}`];
  if(sheetName!==profile.sheetName||target!==expected)throw Error('一般性能報告簽名位置由系統配置，不可變更。');
 }
 const image=book.addImage({base64:signature,extension:/^data:image\/jpeg/i.test(signature)?'jpeg':'png'});if(!profile)sheet.getRow(cell.row).height=Math.max(sheet.getRow(cell.row).height||20,60);sheet.addImage(image,{tl:{col:cell.col-1,row:cell.row-1},ext:profile?{width:180,height:40}:{width:210,height:65},editAs:'oneCell'});
 const actorCell=profile?cell:sheet.getCell(cell.row+1,cell.col);
 if(profile){actorCell.font={size:7};actorCell.alignment={vertical:'bottom',wrapText:true};}
 actorCell.value=`${actor}｜${new Date(at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}`;
 return new Uint8Array(await book.xlsx.writeBuffer());
}

async function createGeneralTemplate(request,demo,templateBytes){
 const Excel=await excelModule(),book=new Excel.Workbook();
 if(!templateBytes){const response=await fetch(`${import.meta.env?.BASE_URL||'/'}templates/general-performance-v1.xlsx`);if(!response.ok)throw Error('一般性能試驗範本載入失敗，請稍後重試。');templateBytes=await response.arrayBuffer();}
 await book.xlsx.load(templateBytes);normalizeReportMerges(book);
 if(!generalProfile(book))throw Error('一般性能試驗範本版本不正確。');
 const sheet=book.getWorksheet(GENERAL_COVER),detail=book.getWorksheet(GENERAL_DETAIL);
 sheet.getCell('AK3').value=`DQA-${request.id}`;
 sheet.getCell('F11').value=request.productName||request.project||request.productCode||'';
 sheet.getCell('F13').value=request.productCode||request.product||'';
 sheet.getCell('AC13').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 sheet.getCell('AF11').value=request.execution?.plannedStart?.slice(0,10)||'';
 sheet.getCell('AM11').value=request.execution?.completedAt?.slice(0,10)||'';
 for(const address of ['V118','AA118','AF118','AK118'])detail.getCell(address).value=null;
 for(const address of ['AF48','AL48'])sheet.getCell(address).value='□';
 for(const address of ['F54','S54','AF54'])sheet.getCell(address).value=null;
 if(demo){sheet.getCell('A40').value='DEMO：一般性能試驗流程展示，結果 OK；非正式試驗結果。';sheet.getCell('W40').value='DEMO ONLY: simulated result OK, not a real test result.';sheet.getCell('AF48').value='☑';detail.getCell('Q82').value='DEMO 22 km/hr';}
 sheet.getCell('F50').value='試驗報告版次：T-01｜DQA Demo 圖片簽名，無正式電子簽章效力。';
 for(const row of GENERAL_PAGE_ENDS.slice(0,-1))detail.getRow(row).addPageBreak();
 refreshHeaderReferences(book);book.calcProperties.fullCalcOnLoad=true;
 return new Uint8Array(await book.xlsx.writeBuffer());
}
