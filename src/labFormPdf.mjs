import {pdfTextLayout} from './pdfTextLayout.mjs';
import {cellText,reportBounds} from './reportLayout.mjs';
// A4 portrait, merged regions and original picture aspect/anchors are retained.
export async function drawLabForms({book,document,font,latin,rgb,sheets}){
 const text=pdfTextLayout(font,latin),color=argb=>{const value=/^[A-Fa-f0-9]{8}$/.test(argb||'')?argb.slice(2):'172B42';return rgb(...[0,2,4].map(i=>parseInt(value.slice(i,i+2),16)/255));};
 for(const sheet of sheets){
  const bounds=reportBounds(sheet),count=Math.max(12,bounds.columns),rows=bounds.rows;
  const widths=Array.from({length:count},(_,i)=>((sheet.getColumn(i+1).width||7.8)*7+5)*.75),heights=Array.from({length:rows},(_,i)=>sheet.getRow(i+1).height||11.5);
  const scale=Math.min(559/widths.reduce((a,b)=>a+b,0),806/heights.reduce((a,b)=>a+b,0));
  const xs=[(595-widths.reduce((a,b)=>a+b,0)*scale)/2],ys=[824];widths.forEach(w=>xs.push(xs.at(-1)+w*scale));heights.forEach(h=>ys.push(ys.at(-1)-h*scale));
  const page=document.addPage([595,842]),merges=new Map();
  for(const range of sheet.model.merges||[]){const [a,b]=range.split(':').map(v=>sheet.getCell(v));merges.set(a.address,{row:b.row,col:b.col});}
  for(let row=1;row<=rows;row++)for(let col=1;col<=count;col++){
   const cell=sheet.getCell(row,col);if(cell.isMerged&&cell.master.address!==cell.address)continue;
   const end=merges.get(cell.address)||{row,col},x=xs[col-1],top=ys[row-1],width=xs[end.col]-x,height=top-ys[end.row],value=cellText(cell),size=(cell.font?.size||9)*scale;
   if(cell.fill?.fgColor?.argb)page.drawRectangle({x,y:top-height,width,height,color:color(cell.fill.fgColor.argb)});
   for(const [edge,b] of Object.entries(cell.border||{}))if(b?.style&&['top','bottom','left','right'].includes(edge)){
    const x1=edge==='right'?x+width:x,y1=edge==='bottom'?top-height:top,x2=edge==='left'||edge==='right'?x1:x+width,y2=edge==='left'||edge==='right'?top-height:y1;
    page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:.45*scale,color:color(b.color?.argb||'FF617180')});
   }
   if(!value)continue;const lines=[];
   for(const paragraph of String(value).split('\n')){let line='';for(const c of paragraph){if(line&&text.width(line+c,size)>width-6*scale){lines.push(line);line='';}line+=c;}lines.push(line);}
   const leading=size*1.22;if(lines.length*leading>height+2*scale)throw Error(`「${sheet.name}」${cell.address} 文字超出列印區域，請分段至規範續頁後再匯出。`);
   const offset=cell.alignment?.vertical==='bottom'?height-lines.length*leading-2*scale:cell.alignment?.vertical==='top'?3*scale:Math.max(2*scale,(height-lines.length*leading)/2);
   lines.forEach((line,i)=>{const widthText=text.width(line,size),align=cell.alignment?.horizontal;let left=x+3*scale;if(align==='center')left=x+(width-widthText)/2;if(align==='right')left=x+width-widthText-3*scale;text.draw(page,line,{x:left,y:top-offset-size-i*leading,size,font,color:color(cell.font?.color?.argb)});});
  }
  for(const item of sheet.getImages()){
   const media=book.getImage(item.imageId);let bytes=media.buffer;if(!bytes&&media.base64)bytes=Uint8Array.from(atob(media.base64.split(',').at(-1)),c=>c.charCodeAt(0));if(!bytes)throw Error('圖片或簽名內容缺失，停止產生 PDF。');
   const image=media.extension==='png'?await document.embedPng(bytes):['jpeg','jpg'].includes(media.extension)?await document.embedJpg(bytes):null;if(!image)throw Error('範本圖片格式不支援。');
   const c=Math.floor(item.range.tl.col),r=Math.floor(item.range.tl.row),x=xs[c]+(item.range.tl.col-c)*widths[c]*scale,y=ys[r]-(item.range.tl.row-r)*heights[r]*scale;
   const width=(item.range.ext?.width||165)*.75*scale,height=(item.range.ext?.height||45)*.75*scale;
   page.drawImage(image,{x,y:y-height,width,height});
  }
 }
}
