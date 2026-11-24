import {withRequestDeadline} from './requestDeadline.mjs';
// Font/template bodies can stall after HTTP headers too. Preserve caller buffers
// and existing error text; no automatic retry or business mutation is performed.
export async function assetBytes(url,{signal,timeoutMs=60000,message='檔案載入失敗，請稍後再試。',fetchImpl=globalThis.fetch}={}){
 try{return await withRequestDeadline(async bounded=>{const response=await fetchImpl(url,{signal:bounded});if(!response.ok)throw Error(message);return response.arrayBuffer();},{signal,timeoutMs});}
 catch(error){if(error?.requestTimedOut)throw Object.assign(Error(message+'（連線逾時）'),{code:'ASSET_TIMEOUT'});throw error;}
}
