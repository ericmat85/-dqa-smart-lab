import {isVirtualRequest} from './requestExecutionKind.mjs';
export const VIRTUAL_MARKER='DQA_VIRTUAL_REQUEST_V1';
export const VIRTUAL_SHEET='虛擬委託標示';
export const VIRTUAL_BANNER='VIRTUAL REQUEST - FLOW TEST - NOT FOR OFFICIAL USE';
export function markVirtualWorkbook(book,request){
 if(!isVirtualRequest(request))return;
 if(!request?.id)throw Error('虛擬委託缺少委託編號。');
 const sheet=book.getWorksheet(VIRTUAL_SHEET)||book.addWorksheet(VIRTUAL_SHEET);
 sheet.state='visible';sheet.getColumn(1).width=26;sheet.getColumn(2).width=82;
 sheet.getCell('A1').value=VIRTUAL_MARKER;sheet.getCell('B1').value=request.id;
 sheet.getCell('A2').value='虛擬委託｜流程測試';sheet.getCell('B2').value='此文件不代表實體試驗已完成，不得作為正式試驗結果。';
 sheet.getRow(2).height=35;sheet.getRow(2).font={bold:true,color:{argb:'FF994D00'},size:12};sheet.getCell('B2').alignment={wrapText:true};
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:B2'};
 book.subject=VIRTUAL_MARKER+':'+request.id;
 book.eachSheet(ws=>{if(!ws.state||ws.state==='visible')ws.headerFooter={...ws.headerFooter,differentFirst:false,differentOddEven:false,oddHeader:VIRTUAL_BANNER,oddFooter:'Virtual case: '+request.id};});
}
export function virtualWorkbookId(book){const sheet=book.getWorksheet(VIRTUAL_SHEET);return sheet?.getCell('A1').text===VIRTUAL_MARKER?sheet.getCell('B1').text:null;}
export function validateWorkbookPurpose(book,request){
 const marked=virtualWorkbookId(book),virtual=isVirtualRequest(request);
 if(virtual){if(marked!==(request.id||request.request_legacy_id)||book.getWorksheet(VIRTUAL_SHEET)?.state==='hidden'||book.getWorksheet(VIRTUAL_SHEET)?.state==='veryHidden'||book.worksheets.some(s=>(!s.state||s.state==='visible')&&(s.headerFooter?.oddHeader!==VIRTUAL_BANNER||s.headerFooter?.differentFirst||s.headerFooter?.differentOddEven)))throw Error('HUMAN_VIRTUAL_MARK_REQUIRED');}
 else if(marked||book.getWorksheet(VIRTUAL_SHEET)||String(book.subject||'').includes(VIRTUAL_MARKER)||book.worksheets.some(s=>String(s.headerFooter?.oddHeader||'').includes(VIRTUAL_BANNER)))throw Error('HUMAN_REPORT_PURPOSE_MISMATCH');
}
export async function markVirtualPdf(document,request){
 if(!isVirtualRequest(request))return;
 const {StandardFonts,rgb}=await import('pdf-lib');const font=await document.embedFont(StandardFonts.HelveticaBold);
 document.setSubject(VIRTUAL_MARKER+':'+request.id);
 for(const page of document.getPages()){page.drawRectangle({x:8,y:6,width:page.getWidth()-16,height:18,color:rgb(1,.94,.82)});page.drawText(VIRTUAL_BANNER,{x:14,y:12,font,size:Math.min(9,(page.getWidth()-28)/font.widthOfTextAtSize(VIRTUAL_BANNER,1)),color:rgb(.55,.22,.03)});}
}
export async function validatePdfPurpose(pdf,request){
 const virtual=isVirtualRequest(request),subject=pdf.getSubject()||'';
 const {PDFArray,PDFRawStream,decodePDFRawStream}=await import('pdf-lib');
 const hex=Array.from(VIRTUAL_BANNER,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').toUpperCase();
 const marked=pdf.getPages().map(page=>{const value=pdf.context.lookup(page.node.Contents()),streams=value instanceof PDFArray?value.asArray().map(x=>pdf.context.lookup(x)):[value];return streams.some(s=>{if(!(s instanceof PDFRawStream)||s.contents.length>8192)return false;const decoded=decodePDFRawStream(s).getBytes(65537);if(decoded.length>65536)return false;const text=new TextDecoder().decode(decoded);return text.toUpperCase().includes('<'+hex+'>')||text.includes('('+VIRTUAL_BANNER+')');});});
 if(virtual){if(subject!==VIRTUAL_MARKER+':'+(request.id||request.request_legacy_id)||marked.some(x=>!x))throw Error('HUMAN_VIRTUAL_MARK_REQUIRED');}
 else if(subject.includes(VIRTUAL_MARKER)||marked.some(Boolean))throw Error('HUMAN_REPORT_PURPOSE_MISMATCH');
}
