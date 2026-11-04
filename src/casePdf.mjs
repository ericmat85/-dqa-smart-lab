import {reportToPdf} from './reportPdf.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
export async function requestToPdf(request,{fontBytes}={}) {
 return reportToPdf(await requestWorkbookBytes(request),{fontBytes,requestId:request.id});
}
export async function buildCasePdf({request,reportBytes,fontBytes}) {
 if(!request?.id)throw Error('缺少委託單，無法合併結案 PDF。');
 if(request.attachments?.length)throw Error('此 Demo 尚未支援附件轉換與合併；不得略過附件結案。');
 const {PDFDocument}=await import('pdf-lib');
 const requestBytes=await requestToPdf(request,{fontBytes});
 const output=await PDFDocument.create(),sections=[];
 for(const [kind,bytes] of [['request',requestBytes],['report',reportBytes]]){
  const source=await PDFDocument.load(bytes);const firstPage=output.getPageCount()+1;
  const pages=await output.copyPages(source,source.getPageIndices());pages.forEach(page=>output.addPage(page));
  sections.push({kind,firstPage,pageCount:pages.length});
 }
 output.setTitle(`DQA 結案文件 ${request.id}（Demo）`);output.setSubject('委託單 → 試驗報告；圖片簽名不具正式電子簽章效力');
 return {bytes:new Uint8Array(await output.save()),sections};
}
