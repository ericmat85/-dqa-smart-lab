// Auth administration stays on the server. Recipients come only from a committed,
// authorized database intent; never from an arbitrary email in the HTTP body.
const REF='mmazbwzdiizabikmiily';
const uuid=value=>/^[a-f0-9-]{36}$/.test(value||'');
function serverKey(value){try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url')).role==='service_role'&&JSON.parse(Buffer.from(value.split('.')[1],'base64url')).ref===REF;}catch{return false;}}
export async function deliverAccountInvitation({env,fetchImpl,origin,tenant,actor,result}){
 if(!result?.invitation?.operation_id||result.invitation.state!=='QUEUED'&&result.invitation.state!=='NOT_CONFIGURED')return result;
 const key=env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY;
 if(!serverKey(key))return {...result,invitation:{...result.invitation,state:'NOT_CONFIGURED',code:'SERVER_MAIL_CONFIGURATION_REQUIRED'}};
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 async function rpc(name,body){const r=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{...headers,'Accept-Profile':'dqa_business','Content-Profile':'dqa_business'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('MAIL_RECEIPT_UNAVAILABLE');return r.json();}
 let grant;
 try{grant=await rpc('claim_account_invitation',{p_tenant:tenant,p_operation:result.operation_id,p_actor:actor});}catch{return {...result,invitation:{...result.invitation,state:'UNKNOWN',code:'MAIL_RECEIPT_UNAVAILABLE'}};}
 if(grant?.state!=='DISPATCH_GRANTED')return {...result,invitation:grant};
 if(!uuid(grant.dispatch_id)||!uuid(grant.operation_id)||typeof grant.email!=='string'||!/^\S+@\S+\.\S+$/.test(grant.email))return {...result,invitation:{...result.invitation,state:'UNKNOWN',code:'MAIL_RECEIPT_INVALID'}};
 let state='UNKNOWN',code='DELIVERY_UNKNOWN';
 try{
  const response=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/auth/v1/invite?redirect_to='+encodeURIComponent(origin+'/account/activate'),{method:'POST',headers,body:JSON.stringify({email:grant.email}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.ok){const user=await response.json();if(uuid(user?.id)&&String(user.email||'').toLowerCase()===grant.email.toLowerCase()){state='SENT';code='ACCEPTED';}}
  else if(response.status>=400&&response.status<500){state='FAILED';code=response.status===429?'RATE_LIMITED':'EMAIL_REJECTED';}
 }catch{/* A lost provider acknowledgement never triggers an automatic resend. */}
 let invitation={operation_id:grant.operation_id,state,code};
 try{invitation=await rpc('finish_account_invitation',{p_tenant:tenant,p_id:grant.operation_id,p_dispatch:grant.dispatch_id,p_state:state,p_code:code});}catch{invitation={operation_id:grant.operation_id,state:'UNKNOWN',code:'MAIL_RECEIPT_UNAVAILABLE'};}
 return {...result,invitation};
}
