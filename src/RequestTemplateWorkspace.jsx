import {useRef,useState} from 'react';
import BlankRequestTemplateList from './BlankRequestTemplateList.jsx';
import WorkspaceTemplateDefault from './WorkspaceTemplateDefault.jsx';
export default function RequestTemplateWorkspace({actorId,system,rows,bindingRows=rows,defaultId,revision,manage,busy,loaded,error,uncertain,onRecover,onSave,onPreview,onDelete,onBind,automation,native=true}){
 const owner=actorId+':'+system,[choice,setChoice]=useState(null),area=useRef(null),selected=choice?.owner===owner?choice.id:defaultId;
 function select(id){setChoice({owner,id});}
 function focusBinding(row){select(row.id);area.current?.scrollIntoView({block:'center',behavior:'smooth'});area.current?.querySelector('select')?.focus({preventScroll:true});}
 return <BlankRequestTemplateList rows={rows} defaultId={defaultId} manage={manage} busy={busy} loaded={loaded} error={error} uncertain={uncertain} onRecover={onRecover} native={native} onSave={async value=>{const saved=await onSave(value);if(saved?.id)select(saved.id);return saved;}} onPreview={onPreview} onDelete={onDelete} onBind={focusBinding} automation={automation} bindingContent={<div ref={area} className="request-template-binding-panel"><WorkspaceTemplateDefault embedded rows={bindingRows} defaultId={defaultId} revision={revision} value={selected} onChange={select} manage={manage} busy={busy} loaded={loaded} uncertain={uncertain} onSave={async id=>{const saved=await onBind(id);if(saved)setChoice(null);return saved;}} onPreview={onPreview} automation={automation}/></div>}/>;
}
