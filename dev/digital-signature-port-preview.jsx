// Development-only entry. Never imported by the production application.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import SignatureMethodSettings from '../src/SignatureMethodSettings.jsx';
import {signaturePortConfig} from '../src/digitalSignaturePortConfig.mjs';
import './digital-signature-port-preview.css';

const member={id:'d1000000-0000-0000-0000-000000000001'};
const key='dqa-isolated-digital-signature-port-preview-v1';
let fallback=null;
function read(){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}}
function write(value){fallback=value;try{localStorage.setItem(key,JSON.stringify(value));}catch{/* File previews can have storage disabled. Keep this session usable. */}}
function snapshot(){const item=read();return {scope_member_id:member.id,config:item?.config||null,revision:item?.revision||0,configured:!!item?.config,can_manage:true,digital_ready:false,signing_enabled:false,verification_approved:false,source:'ISOLATED_DEVELOPMENT_FIXTURE'};}
function fail(code){throw Object.assign(Error(code),{code});}
const client={async request(path,{method='GET',body}={}){
 if(method==='GET'){
  if(path==='/signature-settings?section=port')return {data:snapshot()};
  if(path==='/signature-settings?section=targets')return {data:[]};
  if(path==='/signature-settings')return {data:{method:'IMAGE',revision:0,digital_ready:false,can_manage:true}};
 }
 if(method==='POST'&&path==='/signature-settings'){
  if(body.method==='IMAGE')return {data:{method:'IMAGE',revision:0,digital_ready:false,can_manage:true}};
  const current=snapshot();if(body.member_id!==member.id)fail('SIGNATURE_PORT_ADMIN_REQUIRED');
  if(body.expected_revision!==current.revision)fail('REVISION_CONFLICT');
  if(body.action==='save_port'){const config=signaturePortConfig(body.config);write({config,revision:current.revision+1});return {data:snapshot()};}
  if(body.action==='check_port')return {data:{state:'BLOCKED',code:'SIGNATURE_PORT_ORIGIN_NOT_APPROVED',digital_ready:false,signing_enabled:false}};
 }
 fail('SIGNATURE_PORT_VERIFICATION_NOT_APPROVED');
}};
const Flask=()=> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 3h6m-5 0v6L4.4 19a1.4 1.4 0 0 0 1.2 2h12.8a1.4 1.4 0 0 0 1.2-2L14 9V3M7.6 14h8.8"/><path d="M10 17h.01M14 18h.01"/></svg>;
function App(){const [generation,setGeneration]=useState(0);return <>
 <aside className="preview-banner"><strong>開發預覽 · 隔離測試資料</strong><span>未連接正式帳號、資料庫或簽章服務；此檔不會送出網路請求。</span><button onClick={()=>{write(null);setGeneration(x=>x+1);}}>重設預覽資料</button></aside>
 <div className="preview-shell"><nav className="preview-sidebar" aria-label="系統位置示意"><div className="preview-brand"><Flask/><strong>DQA Smart Lab</strong></div><div>儀表板</div><div>試驗委託</div><div>排程管理</div><div>設備管理</div><div>物料管理</div><div>資料庫</div><div>報表分析</div><div aria-current="page">系統管理</div></nav>
 <div className="preview-workspace"><header className="preview-topbar">實驗室管理系統<span>系統管理 › 文件與報告設定</span></header><main>
 <div className="preview-tabs" aria-label="既有分類位置"><span>管理總覽</span><span>試驗與設備參數</span><span aria-current="page">文件與報告設定</span><span>系統備份設定</span><span>資訊安全設定</span></div>
 <div className="preview-title"><Flask/><div><h1>文件與報告設定</h1><p>數位簽章端口預作 · 沿用既有分類</p></div></div>
 <div className="preview-guide"><strong>操作看看</strong><p>選擇「數位簽章」查看端口設定，填寫示意 HTTPS 位址並儲存，再執行連線檢查。這份預覽會顯示待完成服務端設定，不會連線到輸入的位址。預覽設定只保存在此瀏覽器的獨立測試區。</p></div>
 <SignatureMethodSettings key={generation} account={member} client={client} connected={true}/>
 <footer className="preview-footer">使用實際設定元件的開發預覽。真實服務介接仍需憑證、後端金鑰與核准的服務位址；簽署功能尚未啟用。</footer>
 </main></div></div></>;}
createRoot(document.getElementById('root')).render(<App/>);
