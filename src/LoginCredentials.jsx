import {originalBusinessEnabled} from './originalBusiness.mjs';
import {useEffect,useState} from 'react';
import {readRememberedLogin,saveRememberedLogin} from './rememberedLogin.mjs';

export default function LoginCredentials({accountId,passwordId,account,password,onAccountChange,onPasswordChange,disabled=false,rememberScope=accountId}){
 const [visible,setVisible]=useState(false);
 const [initialAccount]=useState(()=>disabled?'':readRememberedLogin(rememberScope));
 const [remember,setRemember]=useState(Boolean(initialAccount)),[rememberError,setRememberError]=useState('');
 useEffect(()=>{if(initialAccount&&!disabled)onAccountChange(initialAccount);},[initialAccount,disabled,onAccountChange]);
 function persist(value,checked){try{saveRememberedLogin(rememberScope,value,checked);setRememberError('');return true;}catch{setRememberError('無法更新記住我的設定，請確認瀏覽器儲存權限。');return false;}}
 function changeAccount(value){onAccountChange(value);if(remember)persist(value,true);}

 useEffect(()=>{
  const hide=()=>setVisible(false);
  window.addEventListener('blur',hide);document.addEventListener('visibilitychange',hide);
  return()=>{window.removeEventListener('blur',hide);document.removeEventListener('visibilitychange',hide);};
 },[]);
 return <div className="login-credentials">
  <label className="login-field-label rq-label" htmlFor={accountId}>登入帳號（電子郵件）</label>
  <input id={accountId} className="login-account-input rq-input" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="請輸入登入帳號" value={account} onChange={event=>changeAccount(event.target.value)} disabled={disabled} required/>
  <label className="login-field-label rq-label" htmlFor={passwordId}>密碼</label>
  <div className="login-password-field"><input id={passwordId} className="rq-input" type={visible&&!disabled?'text':'password'} autoComplete="current-password" placeholder="請輸入密碼" value={password} onChange={event=>onPasswordChange(event.target.value)} disabled={disabled} required/>
   <button type="button" className="login-password-eye" disabled={disabled} aria-label="按住顯示密碼" aria-pressed={visible&&!disabled} title="按住顯示密碼，放開即隱藏" onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;event.currentTarget.setPointerCapture(event.pointerId);setVisible(true);}} onPointerMove={event=>{const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)setVisible(false);}} onPointerUp={()=>setVisible(false)} onPointerCancel={()=>setVisible(false)} onPointerLeave={()=>setVisible(false)} onLostPointerCapture={()=>setVisible(false)} onBlur={()=>setVisible(false)} onKeyDown={event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();setVisible(true);}}} onKeyUp={event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();setVisible(false);}}} onClick={event=>event.preventDefault()}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
   </button>
  </div>
  <div className="login-options-row"><label className="login-remember-label" title="僅記住此入口的帳號，不儲存密碼"><input type="checkbox" checked={remember} disabled={disabled} onChange={event=>{const checked=event.target.checked;if(persist(account,checked))setRemember(checked);}}/><span>記住我</span></label><LoginHelp disabled={disabled}/></div>
  {rememberError&&<p className="login-remember-error" role="alert">{rememberError}</p>}
 </div>;
}
export function LoginHelp({disabled=false}){
 const [notice,setNotice]=useState('');
 return <div className="login-help"><button type="button" className="login-help-button" disabled={disabled} onClick={()=>{if(originalBusinessEnabled()){history.pushState({},'', '/account/forgot-password');window.dispatchEvent(new Event('dqa:navigate'));}else setNotice('請聯絡 DQA 管理員協助重設密碼；本展示環境不會寄送重設郵件。');}}>忘記密碼？</button>{notice&&<p className="login-help-notice" role="status">{notice}</p>}</div>;
}
