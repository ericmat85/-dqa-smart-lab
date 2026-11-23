// Shared report policy for original and virtual requests, uploads and archives.
export const REPORT_FILE_MAX_MB=20;
export const REPORT_FILE_MAX_BYTES=REPORT_FILE_MAX_MB*1024*1024;
export const isReportFileSize=size=>Number.isSafeInteger(size)&&size>=1&&size<=REPORT_FILE_MAX_BYTES;
export function assertReportFileSize(size){if(!isReportFileSize(size))throw Error(`報告檔案須為 1 byte～${REPORT_FILE_MAX_MB} MB；超過上限時請縮小照片或拆分附件。`);}
// A report is downloaded from private Storage after the account API authorizes it.
// Keep the signed URL out of navigation, cookies, referrers and persistent storage.
export function reportDownloadURL(value){
 let url;try{url=new URL(value);}catch{throw Error('報告下載連結無效。');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||!/^\/storage\/v1\/object\/sign\/dqa-business-reports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(xlsx|pdf)$/.test(url.pathname)||url.searchParams.size!==1||!url.searchParams.get('token'))throw Error('報告下載連結無效。');
 return url.href;
}
export async function readReportResponseBytes(response,expectedSize){
 assertReportFileSize(expectedSize);
 if(!response.ok)throw Error('報告檔案讀取失敗，請重新登入後確認權限。');
 const header=response.headers.get('content-length');if(header!==null&&!isReportFileSize(Number(header)))throw Error('報告檔案大小不一致，已停止讀取。');
 const reader=response.body?.getReader();if(!reader)throw Error('報告檔案讀取失敗。');const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>expectedSize||length>REPORT_FILE_MAX_BYTES)throw Error('報告檔案大小不一致，已停止讀取。');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(length!==expectedSize)throw Error('報告檔案大小不一致，已停止讀取。');
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes;
}
