import {reportBounds,cellText} from './reportLayout.mjs';
import {GENERAL_COVER,GENERAL_DETAIL,GENERAL_PAGE_ENDS} from './reportProfiles.mjs';
// Browser-side Demo renderer: preserve the template's merged form and manual
// page breaks. Excel header/footer artwork and charts are not reproduced.
export async function drawGeneralReport({book,document,font,rgb,requestId}){
 if(book.worksheets.filter(sheet=>!sheet.state||sheet.state==='visible').length!==2)throw Error('一般性能報告含額外工作表，尚未封存，以免遺漏內容。');
 const wrap=(value,size,width)=>{
  const lines=[];for(const paragraph of Array.from(String(value)).filter(char=>char.charCodeAt(0)>=32||char==='\n'||char==='\t').join('').split('\n')){
   let line='';for(const char of paragraph){if(line&&font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}lines.push(line);
  }return lines;
 };
 let number=0;
 for(const name of [GENERAL_COVER,GENERAL_DETAIL]){
  const sheet=book.getWorksheet(name),bounds=reportBounds(sheet);
  const breaks=(name===GENERAL_DETAIL?GENERAL_PAGE_ENDS:[]).filter(row=>row>0&&row<bounds.rows).sort((a,b)=>a-b);
  const ends=[...new Set([...breaks,bounds.rows])];let start=1;
  const nativeWidths=Array.from({length:bounds.columns},(_,i)=>(sheet.getColumn(i+1).width||8.43)*7*.75);
  const merges=(sheet.model.merges||[]).map(range=>{const [a,b]=range.split(':').map(address=>sheet.getCell(address));return {address:a.address,top:a.row,left:a.col,bottom:b.row,right:b.col};});
  for(const end of ends){
   const W=595,H=842,margin=30,top=H-margin-20;
   const heights=Array.from({length:end-start+1},(_,i)=>sheet.getRow(start+i).height||15);
   const scale=Math.min((W-2*margin)/nativeWidths.reduce((a,b)=>a+b,0),(H-2*margin-45)/heights.reduce((a,b)=>a+b,0));
   const xs=[margin];nativeWidths.forEach(width=>xs.push(xs.at(-1)+width*scale));
   const ys=[top];heights.forEach(height=>ys.push(ys.at(-1)-height*scale));
   const page=document.addPage([W,H]);number++;
   page.drawText(`DQA Demo | ${requestId}`,{x:margin,y:H-margin,font,size:8});
   page.drawText(`Demo PDF｜${number}｜圖片簽名無正式電子簽章效力`,{x:margin,y:16,font,size:7});
   for(let row=start;row<=end;row++)for(let col=1;col<=bounds.columns;col++){
    const cell=sheet.getCell(row,col);if(cell.isMerged&&cell.master.address!==cell.address)continue;
    const merge=merges.find(item=>item.address===cell.address),lastRow=merge?.bottom||row,lastCol=merge?.right||col;
    if(lastCol>bounds.columns)continue;
    if(lastRow>end)throw Error(`工作表「${name}」${cell.address} 的合併範圍跨越分頁，請調整分頁後再封存。`);
    const x=xs[col-1],y=ys[row-start],width=xs[lastCol]-x,height=y-ys[lastRow-start+1];
    if(cell.border&&Object.keys(cell.border).length)page.drawRectangle({x,y:y-height,width,height,borderWidth:.3,borderColor:rgb(.4,.4,.4)});
    const value=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cellText(cell);if(!String(value).trim())continue;
    let textWidth=width;
    if(!merge&&!cell.alignment?.wrapText){for(let next=col+1;next<=bounds.columns;next++){if(String(cellText(sheet.getCell(row,next))).trim())break;textWidth=xs[next]-x;}}
    let size=Math.max(4,(cell.font?.size||10)*scale),lines=wrap(value,size,Math.max(1,textWidth-4));
    while(lines.length*(size+1)>height-2&&size>4){size=Math.max(4,size-.5);lines=wrap(value,size,Math.max(1,textWidth-4));}
    if(lines.length*(size+1)>height+1)throw Error(`工作表「${name}」${cell.address} 的文字超出 PDF 欄位，請縮短內容或調整列高。`);
    const bottom=cell.alignment?.vertical==='bottom',center=cell.alignment?.vertical==='middle';
    const textHeight=lines.length*(size+1),offset=bottom?height-textHeight-1:center?(height-textHeight)/2:1;
    lines.forEach((line,index)=>{if(!line)return;const align=cell.alignment?.horizontal,tw=font.widthOfTextAtSize(line,size);page.drawText(line,{x:align==='center'?x+(width-tw)/2:align==='right'?x+width-tw-2:x+2,y:y-offset-size-index*(size+1),font,size});});
   }
   for(const image of sheet.getImages()){
    const row=Math.floor(image.range.tl.row)+1,col=Math.floor(image.range.tl.col);if(row<start||row>end)continue;
    const media=book.getImage(image.imageId);let bytes=media.buffer;
    if(!bytes&&media.base64)bytes=Uint8Array.from(atob(media.base64.split(',').at(-1)),c=>c.charCodeAt(0));
    if(!bytes)throw Error('報告圖片無法讀取，尚未封存。');
    const picture=media.extension==='jpeg'?await document.embedJpg(bytes):media.extension==='png'?await document.embedPng(bytes):null;
    if(!picture)throw Error('報告含不支援的圖片格式，請使用 PNG 或 JPEG。');
    const width=(image.range.ext?.width||180)*.75*scale,height=(image.range.ext?.height||40)*.75*scale;
    page.drawImage(picture,{x:xs[col],y:ys[row-start]-height,width,height});
   }
   start=end+1;
  }
 }
}
