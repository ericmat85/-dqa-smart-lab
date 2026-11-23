import {useEffect,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {SIGNATURE_PORT_DEFAULTS,signaturePortConfig,signaturePortLabel} from './digitalSignaturePortConfig.mjs';
import './DigitalSignaturePortSettings.css';
const same=(a,b)=>Object.keys(SIGNATURE_PORT_DEFAULTS).every(k=>a?.[k]===b?.[k]);
const reasons={
 SIGNATURE_PORT_NOT_CONFIGURED:'請先儲存服務端口設定。',
 SIGNATURE_PORT_ORIGIN_NOT_APPROVED:'此端口尚未加入服務端允許清單，未送出連線請求。',
 SIGNATURE_PORT_CHECKS_DISABLED:'請先啟用並儲存「允許連線檢查」。',
 SIGNATURE_PORT_CREDENTIAL_NOT_CONFIGURED:'服務端尚未設定指定的認證金鑰。',
 SIGNATURE_PORT_CREDENTIAL_NOT_APPROVED:'此認證設定名稱尚未獲服務端允許。',
 SIGNATURE_PORT_ADDRESS_NOT_ALLOWED:'此位址不符合核准的連線範圍；內網服務請使用核准的內網代理。',
 SIGNATURE_PORT_TIMEOUT:'服務回應逾時，請檢查端口與網路。',
 SIGNATURE_PORT_UNAVAILABLE:'端口目前無法連線。',
 SIGNATURE_PORT_RESPONSE_INVALID:'服務回應不符合介接規格，未視為檢查通過。',
 SIGNATURE_PORT_REDIRECT_DENIED:'服務回傳轉址，請確認正確的端口位址。',
};
export default function DigitalSignaturePortSettings({account,client=businessClient}){
 const [data,setData]=useState(null),[draft,setDraft]=useState({...SIGNATURE_PORT_DEFAULTS}),[targets,setTargets]=useState([]),[target,setTarget]=useState(''),[busy,setBusy]=useState('loading'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[check,setCheck]=useState(null),[verification,setVerification]=useState(null);
 useEffect(()=>{let active=true;setBusy('loading');setData(null);setError('');setCheck(null);setVerification(null);
  Promise.all([client.request('/signature-settings?section=port'),client.request('/signature-settings?section=targets')]).then(([p,t])=>{if(!active)return;if(p.data.scope_member_id!==account?.id)throw Error('SIGNATURE_PORT_ADMIN_REQUIRED');setData(p.data);setDraft({...SIGNATURE_PORT_DEFAULTS,...(p.data.config||{})});setTargets(Array.isArray(t.data)?t.data:[]);setTarget('');}).catch(e=>{if(active)setError(e.code?businessErrorMessage(e):'無法確認目前帳號的端口設定。');}).finally(()=>{if(active)setBusy('');});
  return()=>{active=false;};
 },[account?.id,client]);
 const dirty=!same(draft,data?.config),editable=data?.can_manage===true;
 const change=(key,value)=>{setDraft(d=>({...d,[key]:value,...(key==='auth_mode'?{credential_ref:value==='NONE'?'':SIGNATURE_PORT_DEFAULTS.credential_ref}:{})}));setCheck(null);setVerification(null);setNotice('');};
 async function save(){
  let config;try{config=signaturePortConfig(draft);}catch{setError('請填寫端口名稱、有效的 HTTPS 位址及認證設定名稱；請勿填入密碼或私鑰。');return;}
  setBusy('save');setError('');setNotice('');try{
   let result;try{result=(await client.request('/signature-settings',{method:'POST',body:{action:'save_port',member_id:account.id,config,expected_revision:data.revision}})).data;}
   catch(e){if(!e.outcomeUnknown)throw e;result=(await client.request('/signature-settings?section=port')).data;if(!same(result.config,config))throw e;}
   setData(old=>({...old,...result}));setDraft({...SIGNATURE_PORT_DEFAULTS,...result.config});setCheck(null);setVerification(null);setNotice('端口設定已儲存；尚未啟用數位簽章。');
  }catch(e){setError(businessErrorMessage(e));}finally{setBusy('');}
 }
 async function inspect(){
  setBusy('check');setError('');setNotice('');setCheck(null);setVerification(null);try{setCheck((await client.request('/signature-settings',{method:'POST',body:{action:'check_port',member_id:account.id,expected_revision:data.revision}})).data);}catch(e){setError(businessErrorMessage(e));}finally{setBusy('');}
 }
 async function verify(){
  const row=targets.find(x=>x.id===target);if(!row)return;setBusy('verify');setError('');setVerification(null);
  try{setVerification((await client.request('/signature-settings',{method:'POST',body:{action:'verify_report',member_id:account.id,expected_revision:data.revision,artifact_version_id:row.id,expected_sha256:row.sha256}})).data);}catch(e){setError(businessErrorMessage(e));}finally{setBusy('');}
 }
 return <section className="signature-port-settings" aria-label="數位簽章服務端口">
  <header><div><h4>數位簽章服務端口</h4><p>先儲存介接資料，再檢查服務。連線成功不會自動切換簽章方式。</p></div><span className="admin-badge">{data?.configured?'已儲存端口':'尚未設定'}</span></header>
  <fieldset disabled={!!busy||!editable}><div className="signature-port-grid">
   <label>端口名稱<input value={draft.name} maxLength={80} onChange={e=>change('name',e.target.value)} placeholder="例如：實驗室簽章閘道"/></label>
   <label>連線方式<select value={draft.connection_type} onChange={e=>change('connection_type',e.target.value)}><option value="HTTPS_GATEWAY">HTTPS 簽章服務</option><option value="INTRANET_GATEWAY">實驗室內網代理</option></select></label>
   <label className="signature-port-wide">HTTPS 服務位址<input value={draft.base_url} maxLength={500} onChange={e=>change('base_url',e.target.value)} placeholder="https://signer.example.com:443/dqa"/></label>
   <label>服務認證方式<select value={draft.auth_mode} onChange={e=>change('auth_mode',e.target.value)}><option value="BEARER_TOKEN">服務端金鑰</option><option value="NONE">無認證（僅連線檢查）</option></select></label>
   <label>認證設定名稱<input value={draft.credential_ref} disabled={draft.auth_mode==='NONE'} maxLength={67} onChange={e=>change('credential_ref',e.target.value)} placeholder="DQA_SIGNATURE_PORT_TOKEN"/><small>只填設定名稱；金鑰由服務端管理。</small></label>
   <label>簽署憑證識別（選填）<input value={draft.certificate_ref} maxLength={100} onChange={e=>change('certificate_ref',e.target.value)} placeholder="例如：lab-signer-01"/><small>此處不接受憑證私鑰或 PFX 檔案。</small></label>
   <label>連線逾時（秒）<input type="number" min={2} max={20} step={1} value={draft.timeout_seconds} onChange={e=>change('timeout_seconds',Number(e.target.value))}/></label>
   <label>時間戳方式<select value={draft.timestamp_mode} onChange={e=>change('timestamp_mode',e.target.value)}><option value="PROVIDER_MANAGED">由簽章服務提供</option><option value="NONE">不要求時間戳</option></select></label>
   <label className="signature-port-checkbox"><input type="checkbox" checked={draft.allow_checks} onChange={e=>change('allow_checks',e.target.checked)}/>允許連線檢查</label>
  </div></fieldset>
  <p className="signature-port-note">內網服務需經核准的代理與網路連線；儲存位址本身不會連接設備或傳送報告。</p>
  <div className="signature-port-actions"><button type="button" className="template-btn" disabled={!!busy||!editable} onClick={save}>{busy==='save'?'儲存中…':'儲存端口設定'}</button><button type="button" className="template-btn" disabled={!!busy||!editable||dirty||!data?.config?.allow_checks} onClick={inspect}>{busy==='check'?'檢查中…':'檢查端口連線'}</button></div>
  {notice&&<p role="status" className="management-notice">{notice}</p>}{error&&<p role="alert" className="management-error">{error}</p>}
  {check&&<div className="signature-port-result" role="status"><strong>{signaturePortLabel(check.state)}</strong><p>{reasons[check.code]||(check.state==='CONNECTED'?'服務端口可連線；數位簽章仍未啟用。':'狀態未確認。')}</p>{check.state==='CONNECTED'&&<small>驗章介面：{check.verification_supported?'服務宣告可用':'未提供'}；簽署功能仍維持關閉。</small>}</div>}
  <section className="signature-port-verify" aria-label="PDF 報告驗章端口"><h4>PDF 報告驗章端口</h4><p>只針對目前有權讀取的已儲存 PDF 版本送出驗章，不會修改文件或簽核狀態。</p><label>選擇 PDF 報告<select value={target} disabled={!!busy||!targets.length} onChange={e=>{setTarget(e.target.value);setVerification(null);}}><option value="">{targets.length?'請選擇報告版本':'目前沒有可驗章的 PDF 報告'}</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name} · 版本 {t.version}</option>)}</select></label>
  {data?.config?.auth_mode==='NONE'&&<p className="signature-port-note">無認證模式只提供連線檢查；驗章需先設定服務端金鑰。</p>}
  {!data?.verification_approved&&<p className="signature-port-note">驗章服務尚未在服務端開放，現在不會傳送任何 PDF。</p>}
  <button type="button" className="template-btn" disabled={!!busy||dirty||!editable||!target||check?.state!=='CONNECTED'||!check.verification_supported||!data?.verification_approved||data?.config?.auth_mode!=='BEARER_TOKEN'} onClick={verify}>{busy==='verify'?'驗章中…':'送出報告驗章'}</button>
  {verification&&<div role="status" className="signature-port-result"><strong>驗章服務回報：{({UNSIGNED:'未發現數位簽章',INVALID:'驗章未通過',VALID_REPORTED:'有效',INDETERMINATE:'無法確定'})[verification.result]||'待確認'}</strong><p>數位簽章數量：{verification.signature_count}；報告版本 SHA-256：<code>{verification.document_sha256}</code></p><small>此為設定之驗章服務回報，不會代替人工簽核或啟用簽署功能。</small></div>}
  </section>
 </section>;
}
