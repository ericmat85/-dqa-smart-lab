import RequestIdentifier from './RequestIdentifier.jsx';
import {useCallback,useEffect,useRef,useState} from 'react';
import {businessIdentity,businessSessionVersion} from './originalBusiness.mjs';
import {trialTemplateInbox,prepareTrialTemplateDownload} from './trialTemplateDeliveryClient.mjs';
import {downloadTemplate} from './TemplatePreview.jsx';
import './LabBoundTemplates.css';
export default function LabBoundTemplates({actorId,sourceKey=''}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
 const lifetime=useRef(0),attempted=useRef(new Set()),sequence=useRef(0),automatic=useRef(false),manual=useRef(false);
 const refresh=useCallback(async()=>{const token=lifetime.current,seq=++sequence.current;try{const data=await trialTemplateInbox(actorId);if(token===lifetime.current&&seq===sequence.current){setRows(data);setLoadError('');}}catch(e){if(token===lifetime.current&&seq===sequence.current)setLoadError(e.message);}},[actorId]);
 useEffect(()=>{lifetime.current++;const refreshVisible=()=>{if(document.visibilityState==='visible')void refresh();};void refresh();window.addEventListener('focus',refreshVisible);window.addEventListener('dqa:business-change',refreshVisible);const timer=setInterval(refreshVisible,30000);return()=>{lifetime.current++;clearInterval(timer);window.removeEventListener('focus',refreshVisible);window.removeEventListener('dqa:business-change',refreshVisible);};},[refresh]);
 useEffect(()=>{void refresh();},[sourceKey,refresh]);
 useEffect(()=>{
  if(automatic.current||manual.current||businessIdentity()?.member?.id!==actorId)return;const pending=rows.filter(r=>!r.dispatched&&!r.claimed&&!attempted.current.has(r.document_id));if(!pending.length)return;
  const token=lifetime.current,epoch=businessSessionVersion();automatic.current=true;
  void(async()=>{try{for(const row of pending){if(token!==lifetime.current||epoch!==businessSessionVersion())return;attempted.current.add(row.document_id);setBusy(row.document_id);try{const file=await prepareTrialTemplateDownload(row,{actorId});if(token!==lifetime.current||epoch!==businessSessionVersion()||businessIdentity()?.member?.id!==actorId)return;if(file){downloadTemplate(file);setNotice('已送出綁定範本的下載要求；若瀏覽器未提供檔案，請使用手動下載。');}}catch(e){if(token===lifetime.current)setError(e.message);}}}finally{automatic.current=false;if(token===lifetime.current){setBusy('');void refresh();}}})();
 },[rows,refresh,actorId]);
 async function download(row){if(manual.current||automatic.current)return;manual.current=true;const token=lifetime.current;setBusy(row.document_id);setError('');try{const file=await prepareTrialTemplateDownload(row,{manual:true,actorId});if(token!==lifetime.current)return;if(file){downloadTemplate(file);setNotice('已送出下載要求，請查看瀏覽器下載清單。');}}catch(e){if(token===lifetime.current)setError(e.message);}finally{manual.current=false;if(token===lifetime.current){setBusy('');void refresh();}}}
 if(!rows.length&&!error&&!loadError)return null;
 return <section className="lab-panel lab-bound-templates" aria-label="本案綁定試驗範本"><div className="lab-panel-heading"><div><h2>綁定試驗範本</h2><p>委託送出時已固定版本，系統會自動準備下載。多檔下載可能需要瀏覽器允許；也可逐筆手動取得。</p></div><button type="button" disabled={!!busy} onClick={refresh}>重新讀取範本</button></div>{(error||loadError)&&<p role="alert">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">正在準備綁定範本…</p>}<div className="lab-table-wrap"><table><thead><tr><th>委託／試驗</th><th>範本文件／版本</th><th>下載</th></tr></thead><tbody>{rows.map(row=><tr key={row.document_id}><td><RequestIdentifier>{row.request_code}</RequestIdentifier><small>{row.trial_name}</small></td><td>{row.name}<small>{row.version} · {row.dispatched?'已送出下載要求':row.claimed?'下載要求已建立':'待下載'}</small></td><td><button type="button" disabled={!!busy} aria-label={'下載綁定範本：'+row.request_code} onClick={()=>download(row)}>下載範本</button></td></tr>)}</tbody></table></div></section>;
}
