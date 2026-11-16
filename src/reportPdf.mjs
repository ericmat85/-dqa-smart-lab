import {labTemplateProfile,LAB_FORM_VERSION,LAB_REPORT_SHEETS} from './labFormLayout.mjs';
import {drawLabForms} from './labFormPdf.mjs';
import {pdfTextLayout} from './pdfTextLayout.mjs';
import {applyReportPresentation} from './reportPresentation.mjs';
import {generalProfile,refreshHeaderReferences} from './reportProfiles.mjs';
import {drawGeneralReport} from './generalReportPdf.mjs';
import {reportBounds,cellText,normalizeReportMerges} from './reportLayout.mjs';
import {excelModule} from './reportWorkbook.mjs';
const clean=value=>Array.from(String(value??'')).filter(char=>char.charCodeAt(0)>=32||char==='\n'||char==='\t').join('');
export async function reportToPdf(bytes,{fontBytes,requestId='',templatePreview=false}={}){
 const [{PDFDocument,rgb,StandardFonts},kit,Excel]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit'),excelModule()]);
 if(!fontBytes){const response=await fetch(`${import.meta.env?.BASE_URL||'/'}fonts/NotoSansCJKtc-Regular.otf`);if(!response.ok)throw Error('PDF 中文字型載入失敗，尚未封存。');fontBytes=await response.arrayBuffer();}
 const document=await PDFDocument.create();document.registerFontkit(kit.default);const font=await document.embedFont(fontBytes,{subset:false}),latin=await document.embedFont(StandardFonts.Helvetica),textLayout=pdfTextLayout(font,latin);const book=new Excel.Workbook();await book.xlsx.load(bytes);normalizeReportMerges(book);applyReportPresentation(book);
 const lab=labTemplateProfile(book),requestForm=book.getWorksheet('委託單');
 if(lab||requestForm?.getCell('J63').text===LAB_FORM_VERSION){
  const sheets=book.worksheets.filter(s=>(!s.state||s.state==='visible')&&(!lab||LAB_REPORT_SHEETS.includes(s.name)||/^(規範|判定)續頁/.test(s.name)||templatePreview&&s.name==='委託單'));
  await drawLabForms({book,document,font,latin,rgb,sheets});document.setTitle(`試驗委託與報告 ${requestId}`);return new Uint8Array(await document.save());
 }
 if(generalProfile(book)){refreshHeaderReferences(book);await drawGeneralReport({book,document,font,latin,rgb,requestId});document.setTitle(`一般性能試驗報告 ${requestId}`);return new Uint8Array(await document.save());}
 function wrap(text,size,width){const lines=[];for(const paragraph of clean(text).split('\n')){let line='';for(const char of paragraph){if(line&&textLayout.width(line+char,size)>width){lines.push(line);line='';}line+=char;}lines.push(line);}return lines;}
 let pageNumber=0;
 for(const sheet of book.worksheets.filter(row=>row.state==='visible'||!row.state)){
  const bounds=reportBounds(sheet);
  const landscape=sheet.pageSetup.orientation==='landscape'||bounds.columns>10,W=landscape?842:595,H=landscape?595:842,margin=36;
  const count=Math.max(1,bounds.columns),nativeWidths=Array.from({length:count},(_,i)=>(sheet.getColumn(i+1).width||12)*7*.75),scale=(W-margin*2)/nativeWidths.reduce((a,b)=>a+b,0),widths=nativeWidths.map(width=>width*scale),x=[margin];widths.forEach(width=>x.push(x.at(-1)+width));
  const merges=(sheet.model.merges||[]).map(range=>{const [a,b]=range.split(':').map(address=>sheet.getCell(address));return {first:a.address,row:a.row,col:a.col,endRow:b.row,endCol:b.col};});
  let page,y,positions=new Map();const images=sheet.getImages();
  async function drawImages(){for(const image of images){const row=Math.floor(image.range.tl.row)+1,position=positions.get(row);if(!position)continue;const media=book.getImage(image.imageId);let data=media.buffer;if(!data&&media.base64){const encoded=media.base64.split(',').at(-1);data=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));}if(!data)continue;const picture=media.extension==='jpeg'?await document.embedJpg(data):await document.embedPng(data);const col=Math.floor(image.range.tl.col),width=(image.range.ext?.width||210)*.75*scale,height=(image.range.ext?.height||65)*.75*scale;page.drawImage(picture,{x:x[col]||margin,y:position-height,width,height});}}
  function newPage(){page=document.addPage([W,H]);pageNumber++;y=H-margin-24;positions=new Map();textLayout.draw(page,clean(`DQA｜${sheet.name}`),{x:margin,y:H-margin,font,size:10,color:rgb(.25,.32,.45)});textLayout.draw(page,clean(`${requestId} · ${pageNumber}`),{x:margin,y:18,font,size:8,color:rgb(.45,.5,.6)});}
  newPage();
  for(let rowIndex=1;rowIndex<=bounds.rows;rowIndex++){
   const row=sheet.getRow(rowIndex),cells=[];let height=Math.max(18,row.height||20);
   for(let col=1;col<=count;col++){
    const cell=row.getCell(col);if(cell.isMerged&&cell.master.address!==cell.address)continue;
    const merge=merges.find(range=>range.first===cell.address),endCol=merge?.endCol||col,width=x[endCol]-x[col-1],size=Math.min(18,Math.max(7,(cell.font?.size||10)*Math.min(1,scale))),text=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cellText(cell);
    const lines=wrap(text,size,width-8);height=Math.max(height,lines.length*(size+3)+8);cells.push({cell,col,width,size,lines,merge});
   }
   if(height>H-margin*2-30)throw Error(`工作表「${sheet.name}」第 ${rowIndex} 列過高，請分段後再封存。`);
   const signatureNext=images.some(image=>Math.floor(image.range.tl.row)+1===rowIndex+1);
   const required=signatureNext?height+Math.max(60,sheet.getRow(rowIndex+1).height||20)+30:height;
   if(y-required<margin){await drawImages();newPage();}
   positions.set(rowIndex,y);
   for(const {cell,col,width,size,lines}of cells){let color=rgb(1,1,1);const argb=cell.fill?.fgColor?.argb;if(argb&&argb.length>=6){const hex=argb.slice(-6);color=rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}page.drawRectangle({x:x[col-1],y:y-height,width,height,borderWidth:.35,borderColor:rgb(.83,.87,.92),color});lines.forEach((line,index)=>{if(line)textLayout.draw(page,line,{x:x[col-1]+4,y:y-5-size-index*(size+3),size,font,color:rgb(.12,.2,.32)});});}
   y-=height;
  }
  await drawImages();
 }
 document.setTitle(`試驗報告 ${requestId}`);document.setProducer('DQA LMS Demo 報告封存');return new Uint8Array(await document.save());
}
