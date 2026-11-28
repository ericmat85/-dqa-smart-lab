export const DEFAULT_LOGO_PATH='branding/colong-ie-transparent.png';
export const DEFAULT_LOGO_NAME='COLONG-IE-default.png';
export const DEFAULT_LOGO_SHA256='52e9d575a29843fca76749a10e50dc426d7e3037171fd47cfb4ee8f5f9eb5947';
export async function readDefaultWorkspaceLogo(fetchImpl=globalThis.fetch,base=import.meta.env?.BASE_URL||'/'){
 const response=await fetchImpl(base+DEFAULT_LOGO_PATH);if(!response.ok)throw Error('無法讀取預設公司標誌，請稍後再試。');const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>524288)throw Error('預設標誌超過儲存上限。');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==DEFAULT_LOGO_SHA256)throw Error('預設標誌完整性驗證失敗。');let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:image/png;base64,'+btoa(binary);
}
