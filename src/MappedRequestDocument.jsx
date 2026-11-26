import {useCallback,useState} from 'react';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import {mappedCaseDocument} from './documentMappingClient.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
import TemplatePreview from './TemplatePreview.jsx';
export default function MappedRequestDocument({request,account}){
 const [open,setOpen]=useState(false),requestData=JSON.stringify(request);
 // Keep the reader stable when the surrounding information view rerenders with identical data.
 const read=useCallback(async()=>{const pinned=JSON.parse(requestData),file=await mappedCaseDocument('REQUEST',pinned.documentVersionId,account?.id);return file||{name:'委託單_'+pinned.id+'.xlsx',bytes:await requestWorkbookBytes({...pinned,documentVersionId:null})};},[requestData,account?.id]);
 if(!originalBusinessEnabled()||!request.documentVersionId)return null;
 return <div className="mapped-request-document"><button type="button" className="template-btn icon-action request-document-icon" aria-label="查閱委託單" title="查閱委託單" onClick={()=>setOpen(true)}><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3H6a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h6M15 3v6h6M15 3l6 6v3"/><path d="M8 12h8m-8 4h3m-3 4h2" opacity=".8"/><path d="M13 20s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5Z"/><circle cx="20" cy="20" r="2"/></svg></button>{open&&<TemplatePreview title={request.id+'｜委託單'} read={read} downloadable={false} printable previewLabel="唯讀預覽" description="委託資訊與欄位位置依送簽版本固定，後續主管、執行者的填選與簽名依已完成流程顯示，僅供查閱；可列印目前工作表，不提供檔案下載。" onClose={()=>setOpen(false)}/>}</div>;
}
