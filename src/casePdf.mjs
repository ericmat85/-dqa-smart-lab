import {excelModule} from './reportWorkbook.mjs';
import {reportToPdf} from './reportPdf.mjs';
import {getSignatureHistory} from './signatureHistory.mjs';
export async function requestToPdf(request,{fontBytes}={}) {
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=book.addWorksheet('電子委託單');
 sheet.columns=[20,24,24,24,24,20].map(width=>({width}));
 sheet.mergeCells('A1:F1');sheet.getCell('A1').value='電子委託信賴性評價單｜Demo';sheet.getRow(1).height=30;
 sheet.mergeCells('A2:F2');sheet.getCell('A2').value='假資料展示／圖片簽名不具正式電子簽章效力';
 const fields=[['委託編號',request.id],['產品代碼／品名',request.productCode||request.product],['產品類型',request.productType],['客戶／客戶品番',[request.customer,request.customerPartNo].filter(Boolean).join('／')],['委託者／部門',[request.requester,request.department].filter(Boolean).join('／')],['需求日期／樣品數',[request.dueDate,request.quantity].filter(value=>value!==undefined).join('／')],['試驗項目',(request.testItems||[]).join('、')],['試驗目的',(request.purpose||[]).join('、')],['樣品來源',(request.sampleSource||[]).join('、')],['樣品版次',[request.productVersion,request.pcbaVersion,request.softwareVersion].filter(Boolean).join('／')],['試驗規範／手法',request.specification],['判定基準',request.judgementCriteria],['備註',request.notes]];
 fields.forEach(([label,value],index)=>{const row=index+4;sheet.getCell(row,1).value=label;sheet.mergeCells(`B${row}:F${row}`);sheet.getCell(row,2).value=String(value??'—');});
 const signatures=getSignatureHistory(request).filter(item=>item.signature);
 signatures.forEach((signature,index)=>{
  const row=19+Math.floor(index/2)*3,column=index%2?4:1;
  const first=column===1?'A':'D',last=column===1?'C':'F';
  sheet.mergeCells(`${first}${row}:${last}${row}`);sheet.getCell(row,column).value=`${signature.stage}｜${signature.actor||signature.actorId}｜${signature.decision||''}｜${signature.at||''}`;
  if(/^data:image\/(png|jpeg);base64,/i.test(signature.signature)){
   const id=book.addImage({base64:signature.signature,extension:/^data:image\/jpeg/i.test(signature.signature)?'jpeg':'png'});
   sheet.getRow(row+1).height=55;sheet.addImage(id,{tl:{col:column-1,row},ext:{width:180,height:60},editAs:'oneCell'});
  }
 });
 sheet.eachRow({includeEmpty:true},item=>item.eachCell({includeEmpty:true},cell=>{cell.alignment={wrapText:true,vertical:'middle'};}));
 return reportToPdf(await book.xlsx.writeBuffer(),{fontBytes,requestId:request.id});
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
