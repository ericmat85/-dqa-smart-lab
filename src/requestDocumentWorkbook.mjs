import {markVirtualWorkbook} from './virtualDocuments.mjs';
import {excelModule} from './reportWorkbook.mjs';
import {getSignatureHistory} from './signatureHistory.mjs';
import {addRequestForm,formAssets} from './labFormLayout.mjs';
function addSignature(book,sheet,value,col,row,width=145,height=48){
 if(!/^data:image\/(png|jpeg);base64,/i.test(value||''))return;
 const image=book.addImage({base64:value,extension:/^data:image\/jpeg/i.test(value)?'jpeg':'png'});sheet.addImage(image,{tl:{col,row},ext:{width,height},editAs:'oneCell'});
}
// Layout uses only the case's actual signature history; never the reference PDF signatures.
export async function requestWorkbookBytes(request,{assets}={}){
 if(!assets&&typeof window!=='undefined')assets=await formAssets(globalThis.fetch,{photos:false});
 const Excel=await excelModule(),book=new Excel.Workbook(),sheet=addRequestForm(book,request,null,assets);
 const records=getSignatureHistory(request).filter(x=>x.signature),requester=records.filter(x=>x.stage==='委託送出'||x.actorId===request.ownerId&&x.decision==='送出').at(-1)||{signature:request.requesterSignature,actor:request.requester,at:request.requesterSignatureAt},supervisor=records.filter(x=>x.stage==='直屬主管簽核'&&!/退回|退件/.test(x.decision||'')).at(-1);
 sheet.getCell('H44').value='';addSignature(book,sheet,requester?.signature,7.12,43.2);addSignature(book,sheet,supervisor?.signature,2.12,43.2);
 sheet.mergeCells('A55:F57');sheet.getCell('A55').value=`主管：${supervisor?.actor||supervisor?.actorId||''}\n日期：${supervisor?.at||''}`;sheet.mergeCells('G55:L57');sheet.getCell('G55').value=`委託者：${requester?.actor||request.requester||''}\n日期：${requester?.at||''}`;
 if(records.length>2){
  const history=book.addWorksheet('簽核追溯');history.columns=[16,20,25,25,24].map(width=>({width}));history.addRow(['階段','操作者','時間','決定','簽名']);
  records.forEach((r,i)=>{const row=i+2;history.addRow([r.stage,r.actor||r.actorId,r.at||'',r.decision||'','']);history.getRow(row).height=60;addSignature(book,history,r.signature,4,row-1,130,45);});history.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
 }
 markVirtualWorkbook(book,request);return new Uint8Array(await book.xlsx.writeBuffer());
}
