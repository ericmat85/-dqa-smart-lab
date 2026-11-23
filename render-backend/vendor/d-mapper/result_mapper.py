"""D rules to exact B demo ProviderAdvice, never AdviceResponse/Job/HTTP."""
from copy import deepcopy
from pydantic import ValidationError
from b_dto_reference.schemas import ProviderAdvice
from candidate.quality import capacity,QualityBlock
from source_context import BridgeFault,need
from ai_engine_core.models import digest,SourceReference,HumanReviewRequirement
from ai_engine_core.validation import validate_result

def reference(ref):return ref['document_id']+'@'+ref['version']+':'+ref['locator']
def finding(code,message,severity='info',refs=None):return {'code':code,'severity':severity,'message':message,'references':refs or []}
def map_result(operation,rec,results):
    advice={'summary':'SYNTHETIC CORE RULES: advisory only; not model inference; human confirmation required.','findings':[],'candidates':[],'answer':None,'usage':{'source':'FAKE_OFFLINE','input_tokens':None,'output_tokens':None,'charged_micro_usd':None},'requires_human_confirmation':True}
    wire=rec['wire_payload']
    need(len(results)==len(rec['core_inputs']),'CORE_RESULT_COUNT','INVALID_SOURCE')
    for x,r in zip(rec['core_inputs'],results):
        req=x['request']
        need(r['engine_id']==req['engine_id'] and r['request_id']==req['request_id'] and r['correlation_id']==req['correlation_id'] and r['status']=='ADVISORY' and not r['errors'],'CORE_RESULT_IDENTITY','INVALID_SOURCE')
        need(r['source_refs']==req['source_refs'] and r['audit_metadata']['input_digest']==digest(req) and r['audit_metadata']['output_digest']==digest(r['result_payload']),'CORE_RESULT_INTEGRITY','INVALID_SOURCE')
        validate_result(r['engine_id'],r['result_payload'],tuple(SourceReference.parse(v) for v in r['source_refs']),HumanReviewRequirement(**r['requires_human_review']))
    if operation=='request-review':
        r=results[0]['result_payload'];refs=[reference(x) for x in results[0]['source_refs']]
        for f in r['findings']:
            advice['findings'].append(finding('SPEC_DEVIATION','Synthetic '+f['field']+': requested '+str(f['requested'])+' versus reference '+str(f['reference'])+'.','warning',refs))
        advice['findings'].append(finding('HUMAN_REVIEW_REQUIRED','Supervisor endorsement is not LMS approval or customer authorization.','info',refs))
    elif operation=='report-review':
        r=results[0]['result_payload'];cells=rec['sidecar']['original_cells']
        need(cells==wire['cells'],'ORIGINAL_CELLS_CHANGED','INVALID_SOURCE')
        need(r['draft_data']['original_result']==rec['sidecar']['original_excel_result'],'ORIGINAL_DECISION_CHANGED','INVALID_SOURCE')
        need(r['review_status']=='PENDING_HUMAN' and rec['sidecar']['electronic_signoff']=='PENDING_HUMAN','SIGNOFF_BOUNDARY','INVALID_SOURCE')
        expected={x['sheet']+'!'+x['cell'] for x in cells};need(len(expected)==len(cells),'DUPLICATE_REPORT_CELL')
        for chk in r['checks']:
            need(chk['name'] in expected,'CELL_REFERENCE_MISSING','INVALID_SOURCE')
            advice['findings'].append(finding('DECLARED_LIMIT_REVIEW','Synthetic value compared with explicitly registered limits; original decision retained.','info' if chk['within_declared_limits'] else 'warning',[chk['name']]))
    elif operation=='assistant':
        r=results[0]['result_payload']
        if r['retrieval_status']!='FOUND':raise BridgeFault('REFUSED',r['retrieval_status'])
        need(rec['core_inputs'][0]['request']['request_payload']['query']==wire['question'],'QUERY_CHANGED','INVALID_SOURCE')
        advice['answer']=r['answer']
        advice['findings']=[finding('SYNTHETIC_SOURCE_EXCERPT','Exact synthetic source excerpt; not RAG or regulatory verification.',refs=[reference(c['ref'])]) for c in r['citations']]
    elif operation=='schedule-recommendation':
        plan=rec['sidecar'].get('selection_plan');need(type(plan) is list and len(plan)==len(wire['trials']),'B_SELECTION_CONTEXT_MISSING')
        need(rec['sidecar'].get('selection_authority')=='AUTHOR_DECLARED_SYNTHETIC_NOT_B_RUNTIME','SELECTION_AUTHORITY_UNVERIFIED')
        by_trial={p['trial_id']:p for p in plan};need(len(by_trial)==len(plan),'DUPLICATE_SELECTION_PLAN')
        booked=[]
        for t,x,rr in zip(wire['trials'],rec['core_inputs'],results):
            data=rr['result_payload']
            try:capacity(x['request']['request_payload'],x['context'])
            except QualityBlock:raise BridgeFault('BLOCKED','CAPACITY_EVIDENCE_INSUFFICIENT') from None
            if not data['proposals']:raise BridgeFault('INDETERMINATE','FULL_ENUMERATION_NOT_AVAILABLE')
            p=by_trial.get(t['trial_id']);need(p is not None,'B_SELECTION_CONTEXT_MISSING')
            need(len(p['equipment_ids'])==len(set(p['equipment_ids']))==t.get('required_devices',1),'SELECTION_DEVICE_COUNT')
            matches=[q for q in data['proposals'] if sorted(a['equipment_id'] for a in q['allocations'])==sorted(p['equipment_ids'])]
            need(bool(matches),'DECLARED_SELECTION_NOT_VALIDATED')
            q=matches[0];start=q['start_date'];end=q['expected_end_date']
            need(start==t['start_date'] and q['granularity']=='DAY' and q['applied'] is False,'SCHEDULE_BOUNDARY')
            need(sum(a['sample_count'] for a in q['allocations'])==t['quantity'],'TOTAL_QUANTITY_MISMATCH')
            for id in p['equipment_ids']:
                m=next((m for m in wire['equipment'] if m['resource_id']==id),None)
                need(m is not None and m['available_start']<=start and end<=m['available_end'] and t['conditions'] in m['capabilities'],'EQUIPMENT_WINDOW_OR_CAPABILITY')
            owner=next((e for e in wire['engineers'] if e['resource_id']==p['engineer_id']),None)
            need(owner is not None and owner['available_start']<=start and end<=owner['available_end'] and t['conditions'] in owner['capabilities'],'ENGINEER_CONTEXT_NOT_VALIDATED')
            # Validate a fixture-authored witness; do not choose/reassign people.
            resources={'device:'+i for i in p['equipment_ids']}|{'owner:'+p['engineer_id']}
            need(not any(start<=b and a<=end and bool(resources&old) for a,b,old in booked),'CROSS_TRIAL_SYNTHETIC_CONFLICT')
            booked.append((start,end,resources))
            advice['candidates'].append({'trial_id':t['trial_id'],'equipment_ids':deepcopy(p['equipment_ids']),'engineer_id':p['engineer_id'],'start_date':start,'end_date':end,'time_unit':'day','timezone':'Asia/Taipei','rationale':'SYNTHETIC CORE RULES: fixed fixture selection witness checked; no personnel assignment or Reservation.','deterministic_validation':'SYNTHETIC_FIXTURE_ONLY','requires_human_confirmation':True,'reservation_created':False})
    else:raise BridgeFault('BLOCKED','UNSUPPORTED_OPERATION')
    try:return ProviderAdvice.model_validate(advice).model_dump(mode='json')
    except ValidationError:raise BridgeFault('BLOCKED','B_DTO_RESULT_NOT_REPRESENTABLE') from None
