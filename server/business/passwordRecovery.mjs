import {accountDeletionServiceKey} from './accountDeletion.mjs';
// Anti-enumeration: every syntactically valid request has the same public result.
// Eligible recipient and one-use dispatch permission come only from the database.
export async function requestPasswordRecovery({env,fetchImpl,origin,operation,email,clientHash}){
 const key=accountDeletionServiceKey(env);if(!key)throw Error('RECOVERY_CONFIGURATION_REQUIRED');
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','Accept-Profile':'dqa_business','Content-Profile':'dqa_business'};
 async function rpc(name,body){const r=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('RECOVERY_SERVICE_UNAVAILABLE');return r.json();}
 let grant;try{grant=await rpc('prepare_password_recovery',{p_operation:operation,p_email:email,p_client_hash:clientHash});}catch{return;}
 if(grant?.dispatch!==true)return;
 if(grant.operation_id!==operation||grant.email!==email)return;
 let state='UNKNOWN',code='DELIVERY_UNKNOWN';
 try{const r=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/auth/v1/recover?redirect_to='+encodeURIComponent(origin+'/account/reset-password'),{method:'POST',headers:{apikey:env.BUSINESS_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:grant.email}),redirect:'error',signal:AbortSignal.timeout(12000)});if(r.ok){state='SENT';code='ACCEPTED';}else if(r.status>=400&&r.status<500){state='FAILED';code='PROVIDER_REJECTED';}}catch{/* Never automatically retry a mail whose outcome is unknown. */}
 try{await rpc('finish_password_recovery',{p_operation:operation,p_state:state,p_code:code});}catch{/* Keep the initial UNKNOWN record; do not re-dispatch. */}
}
