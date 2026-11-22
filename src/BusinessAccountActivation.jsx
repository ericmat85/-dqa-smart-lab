import {useEffect,useRef,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {initializeOriginalBusiness,clearOriginalIdentity} from './originalBusiness.mjs';
import EnterpriseLoginLayout from './EnterpriseLoginLayout.jsx';
import useSystemTheme from './useSystemTheme.js';
export default function BusinessAccountActivation({navigate}){
 const {dark,toggleTheme}=useSystemTheme(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(()=>new URLSearchParams(location.hash.slice(1)).has('access_token')),[error,setError]=useState(''),[notice,setNotice]=useState(''),[unknown,setUnknown]=useState(false),[setPasswordRequired,requirePassword]=useState(false),[recovery,setRecovery]=useState(location.pathname==='/account/reset-password'),[activationAllowed,setActivationAllowed]=useState(false),[entryChecked,setEntryChecked]=useState(false);const working=useRef(false),initial=useRef(null);
 useEffect(()=>{
  let active=true;
  if(!initial.current){const params=new URLSearchParams(location.hash.slice(1));if(params.has('access_token')){
   const access_token=params.get('access_token'),refresh_token=params.get('refresh_token'),kind=params.get('type');history.replaceState(null,'',location.pathname);
   const reset=kind==='recovery'||location.pathname==='/account/reset-password';initial.current={kind:reset?'recovery':kind==='invite'?'invite':'verified',promise:businessClient.request('/claim',{method:'POST',body:{access_token,refresh_token}}).then(()=>reset?undefined:initializeOriginalBusiness())};
  }else if(params.has('error')){history.replaceState(null,'',location.pathname);initial.current={kind:'error',promise:Promise.reject(Object.assign(Error('RECOVERY_LINK_INVALID'),{code:'RECOVERY_LINK_INVALID'}))};}
  else if(location.pathname==='/account/reset-password')initial.current={kind:'resume',promise:businessClient.request('/me')};
  else initial.current={kind:'entry',promise:businessClient.request('/config')};}
  const request=initial.current;
  request.promise.then(packet=>{if(!active)return;if(request.kind==='entry'){setActivationAllowed(packet.activation_available===true);setEntryChecked(true);}
   else if(request.kind==='verified')setNotice('帳號已啟用，可以返回首頁選擇工作入口。');
   else{const reset=request.kind==='recovery'||request.kind==='resume';setRecovery(reset);requirePassword(true);setNotice(reset?'請設定新的登入密碼。':'電子郵件已驗證，請設定登入密碼以完成啟用。');}
  }).catch(e=>{if(active){setUnknown(true);setError(request.kind==='entry'?'目前無法確認帳號啟用狀態，請聯絡管理者。':businessErrorMessage(e));setEntryChecked(true);}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[]);
 async function submit(e){e.preventDefault();if(working.current||(!setPasswordRequired&&!activationAllowed))return;if(password!==confirm){setError('兩次密碼不一致。');return;}working.current=true;setBusy(true);setError('');try{
  if(setPasswordRequired){await businessClient.request('/password',{method:'POST',body:{password,...(recovery?{reset_sessions:true}:{})}});requirePassword(false);if(recovery)clearOriginalIdentity();setNotice(recovery?'密碼已重設，請重新登入。':'密碼已設定，帳號啟用完成。請返回首頁選擇工作入口。');}
  else{await businessClient.request('/activate',{method:'POST',body:{email,password}});setNotice('請至電子郵件信箱完成驗證；已有帳號者請直接返回登入。');}
 }catch(e){setError(e.outcomeUnknown?'處理結果尚未確認，請先返回登入確認；請勿重複送出。':businessErrorMessage(e));if(e.outcomeUnknown)setUnknown(true);}finally{setPassword('');setConfirm('');working.current=false;setBusy(false);}}
 const showForm=setPasswordRequired||(!notice&&entryChecked&&activationAllowed);
 return <EnterpriseLoginLayout system="lms" dark={dark} onToggle={toggleTheme}><div className="login-card unified-login-form"><h1>{setPasswordRequired?recovery?'重設登入密碼':'設定登入密碼':recovery?'重設登入密碼':'啟用工作區帳號'}</h1>{notice&&<p role="status">{notice}</p>}{showForm&&<form onSubmit={submit}>{!setPasswordRequired&&<label>電子郵件<input type="email" required autoComplete="username" value={email} disabled={busy||unknown} onChange={e=>setEmail(e.target.value)}/></label>}<label>設定密碼<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} disabled={busy||unknown} onChange={e=>setPassword(e.target.value)}/></label><label>確認密碼<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} disabled={busy||unknown} onChange={e=>setConfirm(e.target.value)}/></label><p>{setPasswordRequired?'密碼至少 12 個字元。':'請使用管理者加入工作區時設定的電子郵件。'}</p><button className="login-submit" disabled={busy||unknown}>{busy?'處理中…':setPasswordRequired?recovery?'重設密碼':'設定密碼並完成啟用':'驗證電子郵件並啟用'}</button></form>}{!busy&&!unknown&&entryChecked&&!activationAllowed&&!setPasswordRequired&&!notice&&!recovery&&<p role="status">系統已有啟用管理者，請由管理者建立帳號並使用啟用信。</p>}{error&&<p role="alert" className="form-error">{error}</p>}<button className="back-button" type="button" onClick={()=>navigate(recovery?'/lms/login':'/')}>{recovery?'返回登入':'返回入口首頁'}</button></div></EnterpriseLoginLayout>;
}
