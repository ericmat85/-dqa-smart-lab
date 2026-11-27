import {useState} from 'react';
import BlankRequestTemplateList from './BlankRequestTemplateList.jsx';
import WorkspaceTemplateDefault from './WorkspaceTemplateDefault.jsx';
import CompactDialog from './CompactDialog.jsx';
export default function RequestTemplateWorkspace({actorId,system,rows,bindingRows=rows,defaultId,revision,manage,busy,loaded,error,uncertain,onRecover,onSave,onPreview,onDelete,onBind,automation,native=true}){
 const owner=actorId+':'+system,[choice,setChoice]=useState(null),open=manage&&choice?.owner===owner;
 function select(id){setChoice({owner,id});}
 return <><BlankRequestTemplateList rows={rows} defaultId={defaultId} manage={manage} busy={busy} loaded={loaded} error={error} uncertain={uncertain} onRecover={onRecover} native={native} onSave={onSave} onPreview={onPreview} onDelete={onDelete} onBind={row=>select(row.id)} automation={automation}/>
 {open&&<CompactDialog title="綁定委託單範本" onClose={()=>setChoice(null)} preventClose={busy} className="trial-catalog-editor request-template-binding-dialog"><WorkspaceTemplateDefault embedded rows={bindingRows} defaultId={defaultId} revision={revision} value={choice.id} onChange={select} manage={manage} busy={busy} loaded={loaded} uncertain={uncertain} onSave={async id=>{const saved=await onBind(id);if(saved)setChoice(null);return saved;}} onPreview={onPreview} automation={automation} onClose={()=>setChoice(null)} onRecover={async()=>{if(await onRecover())setChoice(null);}}/>{error&&<p role="alert">{error}</p>}</CompactDialog>}
 </>;
}
