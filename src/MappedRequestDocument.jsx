import {useCallback,useState} from 'react';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import {mappedCaseDocument} from './documentMappingClient.mjs';
import {requestWorkbookBytes} from './requestDocumentWorkbook.mjs';
import TemplatePreview from './TemplatePreview.jsx';
export default function MappedRequestDocument({request,account}){
 const [open,setOpen]=useState(false);
 const read=useCallback(async()=>{const file=await mappedCaseDocument('REQUEST',request.documentVersionId,account?.id);return file||{name:'委託單_'+request.id+'.xlsx',bytes:await requestWorkbookBytes({...request,documentVersionId:null})};},[request,account?.id]);
 if(!originalBusinessEnabled()||!request.documentVersionId)return null;
 return <div className="mapped-request-document"><button type="button" className="template-btn secondary" onClick={()=>setOpen(true)}>查看委託單（唯讀）</button>{open&&<TemplatePreview title={request.id+'｜委託單'} read={read} downloadable={false} previewLabel="唯讀預覽" description="委託資訊與欄位位置依送簽版本固定，後續主管、執行者的填選與簽名依已完成流程顯示，僅供查閱。" onClose={()=>setOpen(false)}/>}</div>;
}
