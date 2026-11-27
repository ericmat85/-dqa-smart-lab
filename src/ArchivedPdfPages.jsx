import {useEffect,useLayoutEffect,useRef,useState} from 'react';

function PdfPage({document,index,width,root}){
 const element=useRef(null),canvas=useRef(null),[visible,setVisible]=useState(false),[ready,setReady]=useState(false),[ratio,setRatio]=useState(210/297),[error,setError]=useState('');
 useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root:root.current,rootMargin:'400px'});observer.observe(element.current);return()=>observer.disconnect();},[root]);
 useEffect(()=>{
  const target=canvas.current;let cancelled=false,task;setReady(false);setError('');
  if(!visible||!width){target.width=0;target.height=0;return;}
  async function render(){try{const page=await document.getPage(index+1);if(cancelled)return;const base=page.getViewport({scale:1});setRatio(base.width/base.height);const viewport=page.getViewport({scale:width/base.width}),density=Math.min(window.devicePixelRatio||1,1.5);target.width=Math.ceil(viewport.width*density);target.height=Math.ceil(viewport.height*density);task=page.render({canvasContext:target.getContext('2d'),viewport,transform:density===1?undefined:[density,0,0,density,0,0],background:'#FFFFFF'});await task.promise;if(!cancelled)setReady(true);}catch(e){if(!cancelled&&e.name!=='RenderingCancelledException')setError('此頁無法顯示，請下載原 PDF 查看。');}}
  void render();return()=>{cancelled=true;task?.cancel();};
 },[document,index,width,visible]);
 return <figure ref={element} className="archived-pdf-page" style={{width,aspectRatio:ratio}} data-page-index={index} aria-label={`第 ${index+1} 頁，共 ${document.numPages} 頁`}><canvas key={`${width}:${visible}`} ref={canvas} role="img" aria-label={`PDF 第 ${index+1} 頁`} data-ready={ready}/>{error?<p role="alert">{error}</p>:!ready&&<p className="archived-pdf-page-loading">正在顯示第 {index+1} 頁…</p>}<figcaption>{index+1} / {document.numPages}</figcaption></figure>;
}

export default function ArchivedPdfPages({url,zoom=null,onFitPercent,onPageCount,pageIndex=0}){
 const previousWidth=useRef(0);
 const root=useRef(null),[document,setDocument]=useState(null),[fitWidth,setFitWidth]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false,loading;async function load(){try{const [pdf,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);if(cancelled)return;pdf.GlobalWorkerOptions.workerSrc=worker.default;loading=pdf.getDocument({url,isEvalSupported:false,useSystemFonts:true});const result=await loading.promise;if(!cancelled){setDocument(result);onPageCount?.(result.numPages);}}catch{if(!cancelled)setError('PDF 預覽無法載入，請下載原檔查看。');}}void load();return()=>{cancelled=true;loading?.destroy().catch(()=>{});};},[url,onPageCount]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const {width}=entries[0].contentRect;const next=Math.max(1,Math.floor(width-32));setFitWidth(next);onFitPercent?.(Math.max(1,Math.round(next/794*100)));});observer.observe(root.current);return()=>observer.disconnect();},[onFitPercent]);
 useEffect(()=>{if(document)root.current?.querySelector(`[data-page-index="${pageIndex}"]`)?.scrollIntoView({block:'start'});},[pageIndex,document]);
 const width=zoom===null?fitWidth:Math.round(794*zoom/100);
 useLayoutEffect(()=>{if(previousWidth.current&&root.current){const ratio=width/previousWidth.current;root.current.scrollTop*=ratio;root.current.scrollLeft*=ratio;}previousWidth.current=width;},[width]);
 return <div className="archived-pdf-pages" ref={root} aria-label="A4 PDF 頁面" tabIndex={0}>{error?<p className="archived-pdf-message" role="alert">{error}</p>:document?Array.from({length:document.numPages},(_,index)=><PdfPage key={index} document={document} index={index} width={width} root={root}/>):<p className="archived-pdf-message" role="status">正在顯示 A4 頁面…</p>}</div>;
}
