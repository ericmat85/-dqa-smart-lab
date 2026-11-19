import {useState} from 'react';
import CompactDialog from './CompactDialog.jsx';
import ApprovalSignature from './ApprovalSignature.jsx';
import {readDefaultSignature,saveDefaultSignature} from './defaultSignature.mjs';
import './SignatureSettingsDialog.css';

export default function SignatureSettingsDialog({account,onClose,dark=false}){
 const [value,setValue]=useState(()=>{try{return readDefaultSignature(account?.id);}catch{return '';}}),[mode,setMode]=useState('upload'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const change=value=>{setValue(value);setNotice('');setError('');};
 return <CompactDialog title="電子簽名設定" onClose={onClose} className={`admin-edit-dialog signature-settings-dialog ${dark?'theme-dark':''}`}><div className="admin-edit-form"><p>儲存此帳號在目前瀏覽器的預設簽名，供既有簽核流程選用；此處不會簽核案件。</p><ApprovalSignature label="本帳號預設簽名" accountId={account?.id} mode={mode} onModeChange={setMode} value={value} onChange={change} onError={setError} defaultActions={false}/>{notice&&<p role="status" className="management-notice">{notice}</p>}{error&&<p role="alert" className="management-error">{error}</p>}<footer><button type="button" className="template-btn" onClick={onClose}>關閉</button><button type="button" className="management-primary" disabled={!account?.id||!value} onClick={()=>{try{saveDefaultSignature(account.id,value);setError('');setNotice('已儲存此帳號的預設簽名。');}catch{setNotice('');setError('無法儲存，請確認簽名圖片及瀏覽器儲存空間。');}}}>儲存預設簽名</button></footer></div></CompactDialog>;
}
