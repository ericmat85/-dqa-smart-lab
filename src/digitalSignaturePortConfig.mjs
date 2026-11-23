// Public configuration only. A credential reference is an environment-variable NAME.
export const SIGNATURE_PORT_DEFAULTS=Object.freeze({
 name:'',connection_type:'HTTPS_GATEWAY',base_url:'',auth_mode:'BEARER_TOKEN',
 credential_ref:'DQA_SIGNATURE_PORT_TOKEN',certificate_ref:'',timeout_seconds:8,
 timestamp_mode:'PROVIDER_MANAGED',allow_checks:false,
});
export function signaturePortConfig(value){
 const fail=()=>{throw Object.assign(Error('SIGNATURE_PORT_FIELDS_INVALID'),{code:'SIGNATURE_PORT_FIELDS_INVALID'});};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(SIGNATURE_PORT_DEFAULTS).length||Object.keys(value).some(k=>!Object.hasOwn(SIGNATURE_PORT_DEFAULTS,k)))fail();
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80||/[\x00-\x1f]/.test(value.name))fail();
 if(!['HTTPS_GATEWAY','INTRANET_GATEWAY'].includes(value.connection_type)||!['NONE','BEARER_TOKEN'].includes(value.auth_mode)||!['NONE','PROVIDER_MANAGED'].includes(value.timestamp_mode)||typeof value.allow_checks!=='boolean'||!Number.isInteger(value.timeout_seconds)||value.timeout_seconds<2||value.timeout_seconds>20)fail();
 if(typeof value.credential_ref!=='string'||value.auth_mode==='BEARER_TOKEN'&&!/^DQA_SIGNATURE_PORT_[A-Z0-9_]{1,48}$/.test(value.credential_ref)||value.auth_mode==='NONE'&&value.credential_ref!=='')fail();
 if(typeof value.certificate_ref!=='string'||value.certificate_ref.length>100||value.certificate_ref&&!/^[A-Za-z0-9_.:-]+$/.test(value.certificate_ref))fail();
 if(typeof value.base_url!=='string'||value.base_url.length>500||/[%\\\s]/.test(value.base_url))fail();
 let url;try{url=new URL(value.base_url);}catch{fail();}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname||!/^\/[A-Za-z0-9/_-]*$/.test(url.pathname)||url.pathname.includes('//')||url.hostname.endsWith('.')||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))fail();
 return {...value,name:value.name.trim(),base_url:url.origin+url.pathname.replace(/\/$/,'')};
}
export function signaturePortLabel(state){
 return ({NOT_CONFIGURED:'尚未設定',BLOCKED:'待完成服務端設定',CONNECTED:'端口連線成功',FAILED:'端口檢查失敗',VERIFICATION_REPORTED:'已取得驗章服務回報'})[state]||'狀態待確認';
}
