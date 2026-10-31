import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ASSISTANT_DEMOS,assistantReply} from './assistantDemo.mjs';
import './IntelligentAssistant.css';
export default function IntelligentAssistant({snapshot,metrics}){
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[turns,setTurns]=useState([]),[files,setFiles]=useState([]);const input=useRef(null),fileInput=useRef(null),timers=useRef(new Set()),body=useRef(null),examples=useRef(null),focusNewTurn=useRef(false);
 useEffect(()=>()=>{timers.current.forEach(timer=>window.clearTimeout(timer));},[]);
 // Follow streamed replies inside the assistant, without scrolling the page.
 useLayoutEffect(()=>{
  if(!open||!body.current)return;
  if(focusNewTurn.current){
   body.current.querySelector('article:last-child')?.focus({preventScroll:true});
   focusNewTurn.current=false;
  }
  body.current.scrollTop=body.current.scrollHeight;
 },[turns,open]);
 function schedule(callback,delay){
  const timer=window.setTimeout(()=>{timers.current.delete(timer);callback();},delay);
  timers.current.add(timer);
 }
 function ask(text=question,{focusTurn=false}={}){
  if(!text.trim()&&!files.length)return;
  const reply=text.trim()?assistantReply(text,snapshot,metrics):'已附加檔案資訊。本 Demo 不會解析檔案內容，請選擇常見問題進行展示。';
  const characters=typeof Intl.Segmenter==='function'
   ? Array.from(new Intl.Segmenter('zh-TW',{granularity:'grapheme'}).segment(reply),part=>part.segment)
   : Array.from(reply);
  const id=crypto.randomUUID();
  focusNewTurn.current=focusTurn;
  if(focusTurn&&examples.current)examples.current.open=false;
  setTurns(rows=>[...rows,{id,question:text.trim()||'附加檔案',reply:null,typing:true,files:files.map(file=>file.name)}]);
  let position=0;
  function typeNext(){
   position++;
   const visible=characters.slice(0,position).join('');
   const typing=position<characters.length;
   setTurns(rows=>rows.map(row=>row.id===id?{...row,reply:visible,typing}:row));
   if(typing)schedule(typeNext,35);
  }
  schedule(typeNext,400);
  setQuestion('');setFiles([]);
  if(fileInput.current)fileInput.current.value='';
  if(!focusTurn)input.current?.focus();
 }


 return <div className={`intelligent-assistant ${open?"is-expanded":"is-collapsed"}`}><button type="button" className="intelligent-launcher" aria-label={open?"收合AI智能助理":"展開AI智能助理"} title="AI智能助理" aria-expanded={open} aria-controls="intelligent-panel" onClick={()=>setOpen(value=>!value)}><span aria-hidden="true" className="intelligent-launcher-symbol">✦</span><span aria-hidden="true" className="intelligent-launcher-label">AI</span></button>{open&&<aside id="intelligent-panel" className="intelligent-panel" aria-label="AI智能助理"><header><div><strong>✦ AI智能助理</strong><small>Demo 展示 · 20 組常見問答</small></div><button type="button" aria-label="收合AI智能助理" onClick={()=>setOpen(false)}>−</button></header><div className="intelligent-body" ref={body}><p className="intelligent-welcome">您好！可以詢問實驗室流程，或點選常見問題。數量類回答會讀取目前資料。</p><details className="intelligent-examples" ref={examples}><summary>常見問題 <span>20 題</span></summary><div>{ASSISTANT_DEMOS.map(item=><button type="button" key={item.id} onClick={()=>ask(item.question,{focusTurn:true})}><small>{item.category}</small>{item.question}</button>)}</div></details><div className="intelligent-conversation" aria-live="polite" aria-relevant="additions text">{turns.map(turn=><article key={turn.id} tabIndex={-1} aria-label={`對話：${turn.question}`}><p className="intelligent-question">{turn.question}</p>{turn.files.length>0&&<small>附件：{turn.files.join('、')}（僅展示檔名）</small>}<p className="intelligent-reply" aria-busy={turn.typing}>{turn.reply===null?<span className="intelligent-loading" role="status">讀取中<span aria-hidden="true">···</span></span>:<>{turn.reply}{turn.typing&&<span className="intelligent-typing-cursor" aria-hidden="true">▍</span>}</>}</p></article>)}</div></div><form onSubmit={event=>{event.preventDefault();ask();}}><input ref={fileInput} type="file" multiple hidden onChange={event=>setFiles(Array.from(event.target.files||[]))}/>{files.length>0&&<div className="intelligent-files">{files.map((file,index)=><span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`移除 ${file.name}`} onClick={()=>setFiles(rows=>rows.filter((_,i)=>i!==index))}>×</button></span>)}</div>}<div className="intelligent-composer"><button type="button" aria-label="附加檔案" onClick={()=>fileInput.current?.click()}>＋</button><input ref={input} aria-label="輸入問題" placeholder="輸入實驗室相關問題…" value={question} onChange={event=>setQuestion(event.target.value)}/><button type="submit" aria-label="送出問題" disabled={!question.trim()&&!files.length}>➤</button></div><small>示範問答，助理不會直接變更資料。</small></form></aside>}</div>;
}
