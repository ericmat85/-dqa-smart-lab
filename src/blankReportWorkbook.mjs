import {excelModule} from './reportWorkbook.mjs';
const sheet='試驗報告';
export const BLANK_REPORT_MARKER='DQA_BLANK_REPORT_V1';
export const BLANK_REPORT_MAPPING=[['testItems','C3'],['id','C4'],['productCode','I4'],['customer','C5'],['customerPartNo','I5'],['department','C6'],['requester','I6'],['dueDate','C7'],['quantity','I7'],['productType','C8'],['sampleDescription','I8'],['sourceInHouseContent','C9'],['sourceOverseasContent','C10'],['sourceCustomerContent','C11'],['sourceSupplierContent','C12'],['sourceCompetitorContent','C13'],['productVersion','C14'],['pcbaVersion','I14'],['softwareVersion','C15'],['manufactureDate','I15'],['notes','A17'],['specification','A21'],['judgementCriteria','A29']].map(([field,cell])=>({field,sheet,cell}));
export function suggestedReportMapping(book){return book.getWorksheet('範本資訊')?.getCell('A1').value===BLANK_REPORT_MARKER&&book.getWorksheet(sheet)?BLANK_REPORT_MAPPING.map(r=>({...r})):[];}
export async function makeBlankReportWorkbook(trial){
 if(!trial?.name||typeof trial.name!=='string')throw Error('請先選擇適用試驗。');
 const Excel=await excelModule(),book=new Excel.Workbook(),report=book.addWorksheet(sheet),help=book.addWorksheet('範本資訊');book.creator='DQA Smart Lab';
 report.columns=Array.from({length:12},()=>({width:8}));
 function area(range,text='',heading=false){report.mergeCells(range);const c=report.getCell(range.split(':')[0]);c.value=text;c.alignment={vertical:'middle',wrapText:true};c.font={name:'Arial',size:10,bold:heading,color:{argb:heading?'FF17365D':'FF17253B'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:heading?'FFEDF3FB':'FFFFFFFF'}};c.border={top:{style:'thin',color:{argb:'FFDCE4EF'}},bottom:{style:'thin',color:{argb:'FFDCE4EF'}},left:{style:'thin',color:{argb:'FFDCE4EF'}},right:{style:'thin',color:{argb:'FFDCE4EF'}}};}
 area('A1:L2','電子試驗報告單 / Test Report',true);report.getCell('A1').font={name:'Arial',size:20,bold:true,color:{argb:'FF17365D'}};
 area('A3:B3','試驗項目',true);area('C3:L3',trial.name);
 for(const [row,left,right]of [[4,'委託編號','產品代碼'],[5,'客戶名稱','客戶品番'],[6,'委託部門','委託者'],[7,'需求日期','樣品數量'],[8,'產品類型','樣品說明'],[14,'製品版次','PCBA 版次'],[15,'軟體版次','製造日期']]){area(`A${row}:B${row}`,left,true);area(`C${row}:F${row}`);area(`G${row}:H${row}`,right,true);area(`I${row}:L${row}`);}
 for(const [row,label]of [[9,'社內來源'],[10,'海外廠來源'],[11,'客戶來源'],[12,'廠商來源'],[13,'競品來源']]){area(`A${row}:B${row}`,label,true);area(`C${row}:L${row}`);}
 for(const [header,range,label]of [['A16:L16','A17:L19','備註'],['A20:L20','A21:L27','試驗規範／方法'],['A28:L28','A29:L34','判定基準'],['A35:L35','A36:L42','實測結果（執行者填寫）'],['A43:L43','A44:L48','異常與處置（執行者填寫）']]){area(header,label,true);area(range);}
 for(const [head,sign,label]of [['A49:D49','A50:D53','作成'],['E49:H49','E50:H53','確認'],['I49:L49','I50:L53','核准']]){area(head,label,true);area(sign);}
 area('A54:L54','空白原稿：量測結果、判定及簽名須依實際流程填寫。');
 for(let row=1;row<=54;row++)report.getRow(row).height=22;
 report.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:L54'};
 help.columns=[{width:32},{width:20},{width:18}];help.addRow([BLANK_REPORT_MARKER]);help.addRow(['試驗',trial.name]);help.addRow(['欄位','工作表','儲存格']);BLANK_REPORT_MAPPING.forEach(r=>help.addRow([r.field,r.sheet,r.cell]));help.addRow(['請在「試驗報告資訊自動代入」套用建議對應，再確認並儲存。']);
 return new Uint8Array(await book.xlsx.writeBuffer());
}
