// Print only the already rendered worksheet; the application and download actions stay outside it.
export async function printWorkbookSheet(paper,{title,width,height,signal}){
 if(!paper||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw Error('工作表尚未完成載入。');
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const previous=document.activeElement,frame=document.createElement('iframe');frame.title='委託單列印';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
 Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'1px',height:'1px',border:'0'});
 let timer,rejectAbort;
 function cleanup(){clearTimeout(timer);frame.remove();signal.removeEventListener('abort',abort);if(previous?.isConnected)previous.focus({preventScroll:true});}
 function abort(){cleanup();rejectAbort(new DOMException('Aborted','AbortError'));}
 const aborted=new Promise((_,reject)=>{rejectAbort=reject;});signal.addEventListener('abort',abort,{once:true});
 try{
  const loaded=new Promise(resolve=>{frame.onload=resolve;});frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';document.body.append(frame);
  await Promise.race([loaded,aborted]);
  const doc=frame.contentDocument,landscape=width>height,usableWidth=(landscape?273:186)*96/25.4,usableHeight=(landscape?186:273)*96/25.4;
  doc.title=title;
  const style=doc.createElement('style');style.textContent=`@page{size:A4 ${landscape?'landscape':'portrait'};margin:12mm}html,body{margin:0;padding:0;background:#fff;color:#000}body{width:${usableWidth}px;font-family:Arial,"Noto Sans TC",sans-serif}.template-preview-paper{position:relative;background:#fff;margin:0}.template-preview-paper table{border-collapse:collapse;background:#fff;table-layout:fixed}.template-preview-paper td{padding:0 2px;line-height:1.05;box-sizing:border-box;overflow:hidden}.template-preview-paper>img{position:absolute;object-fit:contain}tr{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;doc.head.append(style);
  paper.style.zoom=String(Math.min(1,usableWidth/width,usableHeight/height));paper.style.transform='none';paper.querySelectorAll('[tabindex]').forEach(el=>el.removeAttribute('tabindex'));doc.body.append(doc.importNode(paper,true));
  await Promise.race([Promise.all([doc.fonts.ready,...[...doc.images].map(img=>img.decode())]),aborted]);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,60000);frame.contentWindow.focus();frame.contentWindow.print();
 }catch(error){cleanup();throw error;}
}
