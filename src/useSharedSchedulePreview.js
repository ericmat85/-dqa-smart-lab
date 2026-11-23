import {useEffect,useRef,useState} from 'react';
import {businessClient,businessErrorMessage} from './businessClient.mjs';
import {scheduleDraftCommand} from './sharedScheduleDrafts.mjs';

// Preview never reserves resources, creates a receipt or calls a model.
export default function useSharedSchedulePreview({editing,form,references}){
 let key=null;
 try{
  if(editing?.businessDatabase&&form&&/^\d{4}-\d{2}-\d{2}$/.test(form.time||'')&&String(form.sampleCode||'').trim()){
   const command=scheduleDraftCommand(editing,{...form,end:form.time},references);
   key=JSON.stringify(command);
  }
 }catch{/* Incomplete form fields are already labelled; do not send partial requests. */}
 const current=useRef(key);current.current=key;
 const [state,setState]=useState({key:null,busy:false,plan:null,error:''});
 useEffect(()=>{
  if(!key){setState({key:null,busy:false,plan:null,error:''});return;}
  const controller=new AbortController();let active=true;
  setState({key,busy:true,plan:null,error:''});
  const timer=setTimeout(async()=>{
   try{
    const command=JSON.parse(key),{data}=await businessClient.request('/planning/preview',{method:'POST',body:{command},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
    if(!active||current.current!==key)return;
    if(data?.scheduling_unit!=='DAY'||!Number.isSafeInteger(data.scheduling_days)||data.scheduling_days<1||data.scope!=='DRAFT_ONLY'||data.reserved!==false||data.start_date!==command.data.start_date||!/^\d{4}-\d{2}-\d{2}$/.test(data.end_date||'')||data.end_date<data.start_date||data.sample_space_units!==command.data.sample_space_units||!Number.isFinite(Number(data.hours_per_batch))||Number(data.hours_per_batch)<=0)throw Error('排程計算回應格式無法確認，請重新開啟排程。');
    setState({key,busy:false,plan:data,error:''});
   }catch(error){if(active&&current.current===key)setState({key,busy:false,plan:null,error:error.code?businessErrorMessage(error):error.message});}
  },250);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[key]);
 const value=state.key===key?state:{busy:!!key,plan:null,error:''},ready=!!key&&!!value.plan&&!value.busy;
 const command=ready?{...JSON.parse(key),data:{...JSON.parse(key).data,end_date:value.plan.end_date}}:null;
 return {...value,ready,command};
}
