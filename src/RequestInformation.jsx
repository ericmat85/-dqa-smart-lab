import CompoundSequenceSummary from './CompoundSequenceSummary.jsx';
import {useEffect,useState} from 'react';
import {displayTaipei} from './requestWorkspace.mjs';
import useLabSnapshot from './useLabSnapshot.js';
import {originalBusinessEnabled} from './originalBusiness.mjs';
import {mappingStageContext} from './documentMappingClient.mjs';
import {STAGE_INPUTS} from './templateStageFields.mjs';
import {formatSampleSources} from './requestChoiceFields.mjs';
import {resolveRequestInformation,requestInformationPhase,stageSignature,stageDisplayValue,requestScheduleFields} from './requestInformationModel.mjs';
import WorkflowSignatureImage from './WorkflowSignatureImage.jsx';
import MappedRequestDocument from './MappedRequestDocument.jsx';
import {ReportCasePanel} from './ReportUi.jsx';
import SignatureHistory from './SignatureHistory.jsx';
import {auditSignatures} from './signatureHistory.mjs';
import RequestProgress from './RequestProgress.jsx';
import {PaginatedList} from './Pagination.jsx';
import './RequestInformation.css';
const date=v=>v?displayTaipei(v,{dateOnly:String(v).length===10}):'';
function InformationStatus({status='草稿',version}){
 const tone=['已完成','完成','已結案'].includes(status)?'complete':['取消','已取消'].includes(status)?'cancelled':['退件','補件中','有衝突'].includes(status)?'attention':['試驗中','執行中','進行中'].includes(status)?'running':status==='暫停中'?'paused':status==='草稿'?'draft':'pending';
 const paths={complete:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,cancelled:<><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></>,attention:<><path d="m12 3 10 17H2L12 3Z"/><path d="M12 9v4m0 3h.01"/></>,running:<><path d="M9 3h6m-5 0v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M7 15h10"/></>,paused:<><circle cx="12" cy="12" r="9"/><path d="M9 8v8m6-8v8"/></>,draft:<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8m-8 4h5"/></>,pending:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>};
 return <span className={`request-information-status is-${tone}`} role="status" aria-label={`委託進行狀態：${status}${version?'，第 '+version+' 版':''}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[tone]}</svg><strong>{status}</strong>{version&&<span className="request-information-version">第 {version} 版</span>}</span>;
}
function Fields({rows}){return <dl className="request-information-fields">{rows.map(([label,value,wide])=><div className={wide?'is-wide':''} key={label}><dt>{label}</dt><dd>{value!==undefined&&value!==null&&String(value).trim()!==''?value:'—'}</dd></div>)}</dl>;}
function StageFields({stage,fields={}}){const rows=(STAGE_INPUTS[stage]||[]).flatMap(([key,label,type])=>{const value=stageDisplayValue(fields[key],type);return value!==''?[[label,type==='date'?date(value):value,type==='text'&&!/設備|編號|人員/.test(label)]]:[];});return rows.length?<Fields rows={rows}/>:<p className="request-information-empty">尚無已儲存的填寫資訊。</p>;}
function SignedStage({request,stage,label,entry,loaded=true,failed=false}){const lab=request.businessDatabase&&stage.startsWith('LAB_'),record=lab?loaded&&entry?stageSignature(request,stage,entry):null:stageSignature(request,stage);return <article className="request-information-signature"><h5>{label}</h5>{record?<><p><strong>{record.actor||record.actorId||'—'}</strong><span>{date(record.at)||'—'} · {record.decision||'已記錄'}</span></p>{record.signatureId?<WorkflowSignatureImage record={record} alt={label}/>: /^data:image\/(png|jpeg);base64,/i.test(record.signature||'')?<img src={record.signature} alt={label}/>:<small>此紀錄未附簽名圖片。</small>}{record.comment&&<p className="request-information-comment">{record.comment}</p>}</>:<p className="request-information-empty">{lab&&failed?'簽名紀錄暫時無法讀取':lab&&!loaded?'正在讀取簽名紀錄…':'尚未簽名'}</p>}</article>;}
function FlowSection({number,title,initialOpen,children,badge}){const [open,setOpen]=useState(initialOpen);return <details className="request-information-section" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary><span className="request-information-number">{number}</span><h3>{title}</h3>{badge&&<span className="request-information-stage-state">{badge}</span>}<span className="request-information-chevron" aria-hidden="true"/></summary><div className="request-information-section-body">{children}</div></details>;}
export default function RequestInformation({request:supplied,account,children,childrenStage=2}){
 const snapshot=useLabSnapshot(),request=resolveRequestInformation(supplied,snapshot),documentId=request.documentVersionId,contextKey=documentId+':'+account?.id+':'+request.sourceRevision;
 const [context,setContext]=useState(null),[error,setError]=useState(null),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;if(!originalBusinessEnabled()||!documentId)return;mappingStageContext(documentId,account?.id).then(data=>{if(data.document_id!==documentId)throw Error('委託單版本已變更，請重新開啟資訊。');if(active){setContext({...data,contextKey});setError(null);}}).catch(e=>{if(active)setError({contextKey,message:e.message});});return()=>{active=false;};},[documentId,account?.id,retry,request.sourceRevision,contextKey]);
 const errorMessage=error?.contextKey===contextKey?error.message:'',stages=context?.contextKey===contextKey?context.stages||{}:{},phase=requestInformationPhase(request,stages),schedule=snapshot.schedules.find(r=>r.requestId===request.id&&!['取消','未排程'].includes(r.status)),plan=requestScheduleFields(request,schedule,stages.LMS_1),prepare=stages.LAB_PREPARE,receipt=stages.LAB_RECEIVE,complete=stages.LAB_COMPLETE,unsignedPlan=stages.LMS_1?.preview_only||!stageSignature(request,'LMS_1')&&Object.values(plan).some(v=>v!==undefined&&v!==null&&v!=='');
 const basic=[['產品代碼',request.productCode],['產品類型',request.productType],['客戶名稱',request.customer],['客戶品番',request.customerPartNo],['需求日期',date(request.dueDate)],['測試數量',request.quantity!==''&&request.quantity!==undefined?request.quantity+' 件':''],['委託部門',request.department],['委託者姓名',request.requester],['委託類型',request.priority==='專案關鍵'?'專案':request.priority],['建立日期',date(request.createdAt)],['最後更新',date(request.updatedAt)],...(request.projectCode?[['關聯專案',request.projectCode],['專案分項',request.projectItemIndex],['專案名稱',request.project]]:[])];
 return <div className="unified-request-information" data-document-id={documentId||''}>
 <div className="request-information-toolbar"><InformationStatus status={request.status||'草稿'} version={request.documentVersion}/><MappedRequestDocument request={request} account={account}/></div>
 {errorMessage&&<p className="request-information-error" role="alert">{errorMessage} <button type="button" className="template-btn secondary" onClick={()=>setRetry(v=>v+1)}>重新讀取簽核資料</button></p>}
 <FlowSection key={'request:'+documentId+request.id} number={1} title="委託資訊" initialOpen={phase.active===1} badge={request.status==='草稿'?'填寫中':'委託者填寫'}>
 <h4>產品與委託資料</h4><Fields rows={basic}/>
 <h4>試驗需求與樣品</h4><Fields rows={[
 ['試驗目的',Array.isArray(request.purpose)?request.purpose.join('、'):request.purpose,true],['其他目的說明',request.purposeOther,true],['樣品來源',formatSampleSources(request),true],['製品版次',request.productVersion],['PCBA 版次',request.pcbaVersion],['軟體版次',request.softwareVersion],['製造日期',date(request.manufactureDate)],['試驗項目',Array.isArray(request.testItems)?request.testItems.join('、'):request.testItems,true],['試驗規範／試驗手法',request.specification,true],['判定方式',request.judgementRequired],['判定基準',request.judgementCriteria,true],['其他說明',request.sampleDescription,true],['備註',request.notes,true]]}/>
 <CompoundSequenceSummary stages={request.compoundStages}/><div className="request-information-signatures"><SignedStage request={request} stage="REQUESTER" label="委託者簽名"/><SignedStage request={request} stage="REQUEST_MANAGER" label="直屬主管簽名"/></div>{childrenStage===1&&children}
 </FlowSection>
 {phase.confirmation&&<FlowSection key={'confirm:'+documentId+request.id} number={2} title="委託／排程確認" initialOpen={phase.active===2} badge={unsignedPlan?'排程草稿，尚未簽核':stageSignature(request,'LMS_2')?'已有二階紀錄':'主管確認'}>
 <h4>一階主管填寫資訊</h4>{unsignedPlan&&<p className="request-information-empty">以下為排程草稿，尚未完成一階簽署。</p>}<StageFields stage="LMS_1" fields={plan}/>
 <div className="request-information-signatures"><SignedStage request={request} stage="LMS_1" label="一階主管簽名"/><SignedStage request={request} stage="LMS_2" label="二階主管簽名"/></div>
 {childrenStage===2&&children}
 </FlowSection>}
 {phase.execution&&<FlowSection key={'execution:'+documentId+request.id} number={3} title="執行確認" initialOpen={phase.active===3} badge="實驗室執行人員">
 <h4>試驗前準備與確認</h4><StageFields stage="LAB_RECEIVE" fields={{...(prepare?.fields||{}),...(receipt?.fields||{})}}/>{prepare&&<p className="request-information-empty">準備填寫：{prepare.actor||'—'} · {date(prepare.at)||'—'}</p>}<SignedStage request={request} stage="LAB_RECEIVE" label="執行前確認簽名" entry={receipt} loaded={context?.contextKey===contextKey} failed={Boolean(errorMessage)}/>
 {complete&&<><h4>試驗完成確認</h4><StageFields stage="LAB_COMPLETE" fields={complete.fields}/><SignedStage request={request} stage="LAB_COMPLETE" label="試驗完成簽名" entry={complete} loaded={context?.contextKey===contextKey} failed={Boolean(errorMessage)}/></>}
 {request.execution&&<Fields rows={Object.entries({狀態:request.execution.status,設備:request.execution.equipment,執行人:request.execution.operator,樣品編號:request.execution.sampleCode,開始時間:date(request.execution.startedAt),完成時間:date(request.execution.completedAt)}).filter(([,v])=>v)}/>}
 </FlowSection>}
 {!phase.confirmation&&<p className="request-information-empty">後續確認與執行資訊將隨委託流程顯示。</p>}
 </div>;
}
export function RequestInformationHistory({request:supplied,account}){const snapshot=useLabSnapshot(),request=resolveRequestInformation(supplied,snapshot);return <footer className="request-information-history" aria-label="報告歷程與簽核流程"><ReportCasePanel request={request} account={account} showRequestDocument={false} heading="報告歷程" emptyMessage="尚無報告歷程。"/>
 {request.cancellation&&<details className="request-information-audit"><summary>委託取消紀錄</summary><Fields rows={Object.entries({操作者:request.cancellation.actor,取消時間:date(request.cancellation.at),中止原因:request.cancellation.reason})}/></details>}
 {request.demoFlow&&<details className="request-information-audit"><summary>Demo 流程歷程</summary><PaginatedList items={request.demoFlow.steps}>{rows=><ol>{rows.map(r=><li key={r.id}>{r.label} · {date(r.at)}</li>)}</ol>}</PaginatedList></details>}
 <details className="request-information-audit"><summary>簽核歷程與送簽版本</summary><SignatureHistory request={request}/>{!request.businessDatabase&&<SignatureHistory records={auditSignatures(snapshot.labAudit||[],request.id)}/>}</details><RequestProgress status={request.status}/></footer>;}
