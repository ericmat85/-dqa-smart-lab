export class BusinessError extends Error{constructor(packet,status){super(packet.error?.code||'CONNECTION_FAILED');Object.assign(this,{code:packet.error?.code||'CONNECTION_FAILED',status,trace:packet.trace_id,outcomeUnknown:!!packet.outcome_unknown,workspaces:packet.workspaces});}}
export function createBusinessClient(fetchImpl=globalThis.fetch){
 let refresh;
 async function request(path,{method='GET',body,signal,retry=true}={}){
  let response;try{response=await fetchImpl('/api/business'+path,{method,credentials:'same-origin',cache:'no-store',signal,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}catch(error){if(error.name==='AbortError')throw error;throw new BusinessError({error:{code:method==='GET'?'CONNECTION_FAILED':'WRITE_OUTCOME_UNKNOWN'},outcome_unknown:method!=='GET'},0);}
  let packet;try{packet=await response.json();}catch{throw new BusinessError({error:{code:'RESPONSE_INVALID'},outcome_unknown:method!=='GET'},response.status);}
  if(response.status===401&&packet.error?.code==='SESSION_REFRESH_REQUIRED'&&method==='GET'&&retry){
   if(!refresh)refresh=request('/refresh',{method:'POST',body:{},retry:false}).finally(()=>{refresh=null;});await refresh;return request(path,{method,body,signal,retry:false});
  }
  if(!response.ok)throw new BusinessError(packet,response.status);return packet;
 }
 return {request};
}
export const businessClient=createBusinessClient();
export function businessErrorMessage(error){const labels={ORIGINAL_FORM_INVALID:'表單欄位格式或長度不符，內容仍保留在此頁。',DRAFT_SIGNATURE_INVALID:'草稿簽名須為 1 MB 以內的 PNG 或 JPG 圖片。',SNAPSHOT_PAGINATION_REQUIRED:'工作區資料量已超過此接線版本的上限，需要啟用分頁讀取。',AUTHENTICATION_FAILED:'帳號或密碼不正確，或帳號尚未完成啟用。',AUTHENTICATION_REQUIRED:'請使用正式帳號登入。',SESSION_REFRESH_REQUIRED:'登入需要更新，請按重新讀取後再儲存；本次未送出草稿。',DRAFT_WRITE_DENIED:'目前帳號沒有建立或編輯委託草稿的權限。',MEMBERSHIP_REQUIRED:'帳號尚未加入工作區，請聯絡管理者。',SESSION_REVOKED:'登入已撤銷或權限已變更，請重新登入。',BUSINESS_CONNECTION_DISABLED:'此版本尚未啟用共用資料庫連線。',CONFIGURATION_REQUIRED:'服務設定尚未完成。',REVISION_CONFLICT:'資料已被其他使用者更新，請重新讀取後再編輯。',RULE_NOT_APPROVED:'此階段僅開放委託草稿，正式流程尚未啟用。',DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY:'此草稿編號已有儲存紀錄，請先查詢結果。',WRITE_OUTCOME_UNKNOWN:'尚無法確認儲存結果。請先查詢，請勿重複送出。',PASSWORD_TOO_SHORT:'密碼至少需要 12 個字元。',CONNECTION_FAILED:'目前無法連線，請稍後重新讀取。',UPSTREAM_UNAVAILABLE:'資料服務暫時無法連線。',RATE_LIMITED:'請求過於頻繁，請稍後再試。',SESSION_REVOCATION_UNCONFIRMED:'此裝置已登出，但伺服器撤銷尚未確認。'};return (labels[error.code]||'操作未完成，請核對資料後重試。')+(error.trace?' Trace '+error.trace:'');}
