export const MAPPED_REPORT_SHEET='系統簽核資訊';
export const MAPPED_REPORT_MARKER='DQA_MAPPED_REPORT_V1';
export const MAPPED_REPORT_CELLS={level3:'A22',level2:'E22',executor:'I22'};
export function addMappedReportPage(book,values,hash){
 if(book.getWorksheet(MAPPED_REPORT_SHEET))throw Error('範本不可使用保留工作表名稱：'+MAPPED_REPORT_SHEET);
 const s=book.addWorksheet(MAPPED_REPORT_SHEET);s.columns=Array.from({length:12},()=>({width:12}));s.mergeCells('A1:L1');s.getCell('A1').value=MAPPED_REPORT_MARKER;s.getCell('A1').font={bold:true,size:14};
 for(const [row,label,value] of [[3,'委託單號',values.id],[4,'產品代碼',values.productCode],[5,'試驗項目',values.testItems],[6,'範本雜湊',hash]]){s.getCell('A'+row).value=label;s.mergeCells(`B${row}:L${row}`);s.getCell('B'+row).value=value;}
 s.getCell('A8').value='結果摘要';s.mergeCells('B8:L12');s.getCell('B8').value='';s.getCell('B8').alignment={wrapText:true,vertical:'top'};
 s.mergeCells('A15:L17');s.getCell('A15').value='請在原報告工作表填寫試驗結果，並在本頁 B8 填寫結果摘要後上傳。委託資訊不可修改。三方簽名由系統依審核順序轉印。';s.getCell('A15').alignment={wrapText:true};s.getCell('A21').value='三階主管';s.getCell('E21').value='二階主管';s.getCell('I21').value='執行人員';s.getRow(22).height=65;s.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1};
}
export function mappedReportProfile(book){const s=book.getWorksheet(MAPPED_REPORT_SHEET);return s?{id:'mapped-report-v1',sheetName:s.name,cells:{...MAPPED_REPORT_CELLS}}:null;}
export function mappedReportChecks(book,{id,productCode,testItems,sourceHash,values,mapping}={}){
 const s=book.getWorksheet(MAPPED_REPORT_SHEET);if(!s)return [{label:'保留系統簽核頁',ok:false,detail:'請保留系統簽核資訊工作表。'}];
 const checks=[{label:'系統報告識別',ok:s.getCell('A1').text===MAPPED_REPORT_MARKER,detail:'自訂試驗報告'},{label:'委託編號一致',ok:s.getCell('B3').text===id,detail:s.getCell('B3').text},{label:'產品與試驗一致',ok:(!productCode||s.getCell('B4').text===productCode)&&(!testItems?.length||s.getCell('B5').text===testItems.join('、')),detail:s.getCell('B5').text},{label:'試驗結果摘要已填寫',ok:!!s.getCell('B8').text.trim(),detail:'請填寫系統簽核資訊 B8 的實測結果摘要。'}];
 if(sourceHash)checks.push({label:'指定原稿版本一致',ok:s.getCell('B6').text===sourceHash,detail:'核對送簽時固定版本。'});
 if(values&&mapping)checks.push({label:'代入委託資訊未變更',ok:mapping.every(r=>{const ws=book.getWorksheet(r.sheet);return ws&&(ws.getCell(r.cell).value===null||typeof ws.getCell(r.cell).value!=='object')&&ws.getCell(r.cell).text===String(values[r.field]??'');}),detail:'只可編輯試驗結果，代入的委託資訊需保持原內容。'});
 return checks;
}
