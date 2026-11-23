import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {signaturePortConfig} from '../../src/digitalSignaturePortConfig.mjs';

export const PORT_PROTOCOL='DQA_SIGNATURE_GATEWAY_V1';
const fail=code=>Object.assign(Error(code),{code});
const list=value=>String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
const flags={digital_ready:false,signing_enabled:false};
function ipv6Number(address){
 const halves=address.split('::');if(halves.length>2)return null;
 const left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
 if([...left,...right].some(x=>!/^[a-f0-9]{1,4}$/i.test(x)))return null;
 const words=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
 if(words.length!==8)return null;return words.reduce((n,x)=>(n<<16n)+BigInt(parseInt(x,16)),0n);
}
function inPrefix(n,address,bits){const ref=ipv6Number(address);return ref!==null&&(n>>BigInt(128-bits))===(ref>>BigInt(128-bits));}
export function allowedAddress(address,privateGateway=false){
 const family=isIP(address);if(family===4){
  const [a,b,c]=address.split('.').map(Number);
  const privateIP=a===10||a===172&&b>=16&&b<=31||a===192&&b===168;
  if(privateIP)return privateGateway;
  if(a===0||a===127||a>=224||a===169&&b===254||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0||a===192&&b===88&&c===99||a===192&&b===0&&c===2||a===198&&b===51&&c===100||a===203&&b===0&&c===113)return false;
  return true;
 }
 if(family!==6)return false;const n=ipv6Number(address.toLowerCase());if(n===null)return false;
 if(inPrefix(n,'fc00::',7))return privateGateway;
 if(!inPrefix(n,'2000::',3))return false;
 return ![['2001:db8::',32],['2001::',32],['2001:2::',48],['2001:10::',28],['2001:20::',28],['2002::',16],['3fff::',20]].some(([prefix,bits])=>inPrefix(n,prefix,bits));
}
export async function preparePortConnection(raw,env,lookup=dnsLookup){
 const config=signaturePortConfig(raw),url=new URL(config.base_url),privateGateway=config.connection_type==='INTRANET_GATEWAY';
 const approved=list(privateGateway?env.SIGNATURE_PORT_INTRANET_ENDPOINTS:env.SIGNATURE_PORT_ALLOWED_ENDPOINTS);
 if(!approved.includes(config.base_url))throw fail('SIGNATURE_PORT_ORIGIN_NOT_APPROVED');
 if(!config.allow_checks)throw fail('SIGNATURE_PORT_CHECKS_DISABLED');
 const canPrivate=privateGateway&&env.SIGNATURE_PORT_ALLOW_PRIVATE_GATEWAY==='true';
 let authorization;
 if(config.auth_mode==='BEARER_TOKEN'){
  const refs=new Set(['DQA_SIGNATURE_PORT_TOKEN',...list(env.SIGNATURE_PORT_ALLOWED_CREDENTIAL_REFS)]);
  if(!refs.has(config.credential_ref))throw fail('SIGNATURE_PORT_CREDENTIAL_NOT_APPROVED');
  const secret=env[config.credential_ref];if(typeof secret!=='string'||!secret||secret.length>4096||/[\r\n]/.test(secret))throw fail('SIGNATURE_PORT_CREDENTIAL_NOT_CONFIGURED');
  authorization='Bearer '+secret;
 }
 const host=url.hostname.replace(/^\[|\]$/g,''),family=isIP(host);
 let timer;
 let addresses;
 try{addresses=family?[{address:host,family}]:await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('SIGNATURE_PORT_TIMEOUT')),config.timeout_seconds*1000);})]);}finally{clearTimeout(timer);}
 if(!Array.isArray(addresses)||!addresses.length||addresses.length>32||addresses.some(x=>![4,6].includes(x.family)||isIP(x.address)!==x.family||!allowedAddress(x.address,canPrivate)))throw fail('SIGNATURE_PORT_ADDRESS_NOT_ALLOWED');
 const pinned=[...addresses].sort((a,b)=>a.family-b.family)[0];
 return {config,url,host,pinned,authorization};
}
export function requestPortJSON(plan,path,body){
 const target=new URL(plan.config.base_url+path),bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
 if(bytes&&bytes.length>4300000)throw fail('SIGNATURE_PORT_DOCUMENT_INVALID');
 return new Promise((resolve,reject)=>{
  const options={method:bytes?'POST':'GET',rejectUnauthorized:true,family:plan.pinned.family,headers:{Accept:'application/json',...(plan.authorization?{Authorization:plan.authorization}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{})},
   lookup:(host,opts,callback)=>{if(host!==plan.host)return callback(fail('SIGNATURE_PORT_ADDRESS_NOT_ALLOWED'));if(opts?.all)callback(null,[plan.pinned]);else callback(null,plan.pinned.address,plan.pinned.family);}};
  const req=https.request(target,options,res=>{
   if(res.statusCode!==200||!/^application\/json(?:;|$)/i.test(res.headers['content-type']||'')){res.destroy();return reject(fail(res.statusCode>=300&&res.statusCode<400?'SIGNATURE_PORT_REDIRECT_DENIED':'SIGNATURE_PORT_RESPONSE_INVALID'));}
   const chunks=[];let count=0;res.on('data',chunk=>{count+=chunk.length;if(count>131072){res.destroy();reject(fail('SIGNATURE_PORT_RESPONSE_INVALID'));}else chunks.push(chunk);});
   res.on('error',()=>reject(fail('SIGNATURE_PORT_UNAVAILABLE')));
   res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(fail('SIGNATURE_PORT_RESPONSE_INVALID'));}});
  });
  const timer=setTimeout(()=>req.destroy(fail('SIGNATURE_PORT_TIMEOUT')),plan.config.timeout_seconds*1000);
  req.on('close',()=>clearTimeout(timer));req.on('error',e=>reject(fail(e.code==='SIGNATURE_PORT_TIMEOUT'?'SIGNATURE_PORT_TIMEOUT':'SIGNATURE_PORT_UNAVAILABLE')));
  if(bytes)req.write(bytes);req.end();
 });
}
const safeCode=e=>/^SIGNATURE_PORT_[A-Z_]+$/.test(e.code||'')?e.code:'SIGNATURE_PORT_UNAVAILABLE';
export async function checkSignaturePort(raw,env,{lookup=dnsLookup,request=requestPortJSON}={}){
 if(!raw)return {state:'NOT_CONFIGURED',code:'SIGNATURE_PORT_NOT_CONFIGURED',...flags};
 try{
  const plan=await preparePortConnection(raw,env,lookup),r=await request(plan,'/v1/capabilities');
  if(r?.protocol!==PORT_PROTOCOL||r.api_version!=='1'||typeof r.capabilities?.verify_pdf!=='boolean'||typeof r.capabilities?.sign_pdf!=='boolean')throw fail('SIGNATURE_PORT_RESPONSE_INVALID');
  return {state:'CONNECTED',code:'SIGNATURE_PORT_CONNECTED',protocol:PORT_PROTOCOL,verification_supported:r.capabilities.verify_pdf,provider_signing_supported:r.capabilities.sign_pdf,checked_at:new Date().toISOString(),...flags};
 }catch(e){const code=safeCode(e);return {state:/NOT_CONFIGURED|NOT_APPROVED|NOT_ALLOWED|CHECKS_DISABLED/.test(code)?'BLOCKED':'FAILED',code,...flags};}
}
export async function verifySignaturePort(raw,env,target,{lookup=dnsLookup,request=requestPortJSON}={}){
 if(env.SIGNATURE_PORT_ALLOW_VERIFICATION!=='true')throw fail('SIGNATURE_PORT_VERIFICATION_NOT_APPROVED');
 const plan=await preparePortConnection(raw,env,lookup);
 if(plan.config.auth_mode!=='BEARER_TOKEN')throw fail('SIGNATURE_PORT_CREDENTIAL_NOT_CONFIGURED');
 if(!Buffer.isBuffer(target.bytes)||target.bytes.length<5||target.bytes.length>3145728||target.bytes.subarray(0,5).toString('ascii')!=='%PDF-'||createHash('sha256').update(target.bytes).digest('hex')!==target.sha256)throw fail('SIGNATURE_PORT_DOCUMENT_INVALID');
 const response=await request(plan,'/v1/verify',{protocol:PORT_PROTOCOL,document:{sha256:target.sha256,mime_type:'application/pdf',pdf_base64:target.bytes.toString('base64')},validation:{require_trust_chain:true,require_revocation_check:true,require_timestamp:plan.config.timestamp_mode==='PROVIDER_MANAGED'}});
 if(response?.protocol!==PORT_PROTOCOL||response.document_sha256!==target.sha256||!Number.isInteger(response.signature_count)||response.signature_count<0||response.signature_count>32||!Array.isArray(response.signatures)||response.signatures.length!==response.signature_count)throw fail('SIGNATURE_PORT_RESPONSE_INVALID');
 const signatures=response.signatures.map(item=>{
  if(!['VALID','INVALID','UNKNOWN'].includes(item.integrity)||!['TRUSTED','UNTRUSTED','UNKNOWN'].includes(item.certificate_trust)||!['GOOD','REVOKED','UNKNOWN'].includes(item.revocation)||!['VALID','INVALID','ABSENT','UNKNOWN'].includes(item.timestamp)||item.certificate_sha256!==null&&!/^[a-f0-9]{64}$/.test(item.certificate_sha256||''))throw fail('SIGNATURE_PORT_RESPONSE_INVALID');
  if(item.certificate_trust==='TRUSTED'&&!/^[a-f0-9]{64}$/.test(item.certificate_sha256||''))throw fail('SIGNATURE_PORT_RESPONSE_INVALID');
  return Object.fromEntries(['integrity','certificate_trust','revocation','timestamp','certificate_sha256'].map(k=>[k,item[k]]));
 });
 const invalid=signatures.some(x=>x.integrity==='INVALID'||x.revocation==='REVOKED'||x.timestamp==='INVALID');
 const valid=signatures.length>0&&signatures.every(x=>x.integrity==='VALID'&&x.certificate_trust==='TRUSTED'&&x.revocation==='GOOD'&&(plan.config.timestamp_mode==='NONE'||x.timestamp==='VALID'));
 return {state:'VERIFICATION_REPORTED',source:'CONFIGURED_VERIFICATION_SERVICE',result:!signatures.length?'UNSIGNED':invalid?'INVALID':valid?'VALID_REPORTED':'INDETERMINATE',document_sha256:target.sha256,signature_count:signatures.length,signatures,checked_at:new Date().toISOString(),...flags};
}
