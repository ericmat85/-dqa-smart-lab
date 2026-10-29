import {DEFAULT_SIGNATURE_CELLS} from './reportRules.mjs';
export async function excelModule(){const module=await import('exceljs/dist/exceljs.min.js');return module.default;}
export async function createReportTemplate(request={},demo=false){
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('試驗報告');
 sheet.columns=[18,22,22,22,22,18].map(width=>({width}));
 sheet.mergeCells('A1:F1');sheet.getCell('A1').value='DQA SMART LAB｜試驗報告單';sheet.getCell('A1').font={size:18,bold:true};sheet.getRow(1).height=32;
 sheet.mergeCells('A2:F2');sheet.getCell('A2').value=demo?'DEMO 流程展示資料，非正式試驗結果。':'請依委託內容與實際試驗紀錄填寫。';
 const fields=[['委託編號',request.id,'產品名稱',request.productCode||request.product],['試驗項目',(request.testItems||[]).join('、'),'報告編號',request.id?`RPT-${request.id}`:''],['設備',request.execution?.equipment,'樣品數量',request.quantity],['試驗條件',demo?'DEMO 高溫儲存流程驗證':'','試驗時數',request.execution?.hours||''],['開始時間',request.execution?.plannedStart,'結束時間',request.execution?.completedAt],['試驗依據',request.specification,'測試人員',request.execution?.operator]];
 fields.forEach(([a,b,c,d],index)=>{const row=index+4;sheet.getCell(`A${row}`).value=a;sheet.mergeCells(`B${row}:C${row}`);sheet.getCell(`B${row}`).value=b||'';sheet.getCell(`D${row}`).value=c;sheet.mergeCells(`E${row}:F${row}`);sheet.getCell(`E${row}`).value=d||'';});
 sheet.getRow(11).values=['樣品編號','外觀檢查','功能檢查','試驗結果','備註','判定'];
 if(demo)sheet.getRow(12).values=[request.execution?.sampleCode||'SAMPLE-DEMO','DEMO 正常','DEMO 正常','DEMO 完成','僅供流程測試','DEMO 合格'];
 for(const [row,label,value]of [[16,'試驗結果摘要',demo?'DEMO：試驗流程完成，結果供系統功能展示。':''],[17,'異常紀錄',demo?'DEMO 無異常':'']]){sheet.getCell(`A${row}`).value=label;sheet.mergeCells(`B${row}:F${row}`);sheet.getCell(`B${row}`).value=value;sheet.getRow(row).height=36;}
 sheet.getCell('A18').value='填寫人';sheet.mergeCells('B18:C18');sheet.getCell('B18').value=request.execution?.operator||'';sheet.getCell('D18').value='報告日期';sheet.mergeCells('E18:F18');sheet.getCell('E18').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 sheet.mergeCells('A20:C20');sheet.getCell('A20').value='二階主管簽名';sheet.mergeCells('D20:F20');sheet.getCell('D20').value='三階主管簽名';sheet.getRow(21).height=60;sheet.getRow(22).height=28;
 sheet.eachRow({includeEmpty:true},row=>{row.eachCell({includeEmpty:true},cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.border={top:{style:'thin',color:{argb:'FFDCE4EF'}},bottom:{style:'thin',color:{argb:'FFDCE4EF'}},left:{style:'thin',color:{argb:'FFDCE4EF'}},right:{style:'thin',color:{argb:'FFDCE4EF'}}};});if(!row.height)row.height=24;});
 sheet.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:F23'};
 return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function inspectReport(bytes,requestId,fileName){
 const checks=[];if(!/\.xlsx$/i.test(fileName))throw Error('請使用 .xlsx 檔案；舊 .xls 請先另存為 .xlsx。');if(bytes.byteLength>10*1024*1024)throw Error('檔案上限為 10 MB。');
 const Excel=await excelModule(),book=new Excel.Workbook();try{await book.xlsx.load(bytes);}catch{throw Error('無法讀取 Excel，檔案可能損壞、加密或格式不正確。');}
 const sheet=book.worksheets.find(row=>row.state==='visible'||!row.state);if(!sheet)throw Error('報告沒有可讀取的工作表。');
 if(book.worksheets.some(ws=>ws.rowCount>2000||ws.columnCount>50))throw Error('Demo 報告上限為每張工作表 2,000 列、50 欄。');
 const id=String(sheet.getCell('B4').text||'').trim();checks.push({label:'委託編號一致',ok:id===requestId,detail:id||'B4 尚未填寫'});
 const result=String(sheet.getCell('B16').text||'').trim()||String(sheet.getCell('D12').text||'').trim();checks.push({label:'試驗結果已填寫',ok:Boolean(result),detail:result?'已填寫結果／摘要':'請填寫 B16 結果摘要或 D12 試驗結果'});
 let uncached=false,external=false;book.eachSheet(ws=>ws.eachRow(row=>row.eachCell(cell=>{if(cell.value&&typeof cell.value==='object'&&cell.value.formula){if(cell.value.result===undefined)uncached=true;if(/\[[^\]]+\]/.test(cell.value.formula))external=true;}})));
 checks.push({label:'公式具有已計算結果',ok:!uncached,detail:uncached?'請用 Excel 計算並儲存檔案後重新上傳':'通過'});checks.push({label:'無外部活頁簿公式連結',ok:!external,detail:external?'請移除外部檔案公式連結':'通過'});
 return {ok:checks.every(row=>row.ok),checks,sheetName:sheet.name,engine:'Demo 規則式防呆檢查'};
}
export async function stampReport(bytes,{sheetName,cells=DEFAULT_SIGNATURE_CELLS,level,signature,actor,at}){
 if(!/^data:image\/(png|jpeg);base64,/i.test(signature||''))throw Error('主管電子簽名為必填。');
 const Excel=await excelModule(),book=new Excel.Workbook();await book.xlsx.load(bytes);const sheet=book.getWorksheet(sheetName);if(!sheet)throw Error('指定工作表不存在。');
 const target=cells[`level${level}`];if(!/^[A-Z]{1,2}\d{1,4}$/.test(target||''))throw Error('簽名位置格式錯誤。');const cell=sheet.getCell(target);if(cell.row<20||cell.row>1998||cell.col>48)throw Error('簽名位置須在第 20 列以後，避免覆蓋報告內容。');
 const other=sheet.getCell(cells[level===2?'level3':'level2']);if(Math.abs(cell.col-other.col)<3&&Math.abs(cell.row-other.row)<2)throw Error('二、三階簽名位置不可重疊。');
 const image=book.addImage({base64:signature,extension:/^data:image\/jpeg/i.test(signature)?'jpeg':'png'});sheet.getRow(cell.row).height=Math.max(sheet.getRow(cell.row).height||20,60);sheet.addImage(image,{tl:{col:cell.col-1,row:cell.row-1},ext:{width:210,height:65},editAs:'oneCell'});
 sheet.getCell(cell.row+1,cell.col).value=`${actor}｜${new Date(at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}`;
 return new Uint8Array(await book.xlsx.writeBuffer());
}
