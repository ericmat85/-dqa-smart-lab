// Fresh password verification belongs to Auth. No password/verification flag is
// written to the business database or used to replace the administrator cookie.
const REF='mmazbwzdiizabikmiily';
export function accountDeletionServiceKey(env){try{const key=env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY,payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return payload.role==='service_role'&&payload.ref===REF?key:null;}catch{return null;}}
export async function verifyAdministratorPassword({env,fetchImpl,identity,session,password}){
 const headers={apikey:env.BUSINESS_SUPABASE_ANON_KEY,'Content-Type':'application/json'};
 let response,data;
 try{
  response=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers,body:JSON.stringify({email:identity.email,password}),redirect:'error',signal:AbortSignal.timeout(12000)});
  if([400,401,422].includes(response.status))return 'PASSWORD_INVALID';
  if(!response.ok)return 'REAUTH_UNAVAILABLE';
  data=await response.json();
 }catch{return 'REAUTH_UNAVAILABLE';}
 const valid=data?.user?.id===identity.id&&String(data.user.email||'').toLowerCase()===String(identity.email).toLowerCase()&&typeof data.access_token==='string'&&data.access_token.length>0&&data.access_token.length<5000&&typeof data.refresh_token==='string'&&data.refresh_token.length>0&&data.refresh_token.length<500&&data.access_token!==session.access&&data.refresh_token!==session.refresh;
 if(!valid)return 'REAUTH_UNAVAILABLE';
 // Revoke only the temporary verification session, before making a deletion.
 try{const revoked=await fetchImpl(env.BUSINESS_SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:env.BUSINESS_SUPABASE_ANON_KEY,Authorization:'Bearer '+data.access_token},redirect:'error',signal:AbortSignal.timeout(8000)});if(!revoked.ok)return 'REAUTH_UNAVAILABLE';}catch{return 'REAUTH_UNAVAILABLE';}
 return 'DELETE';
}
