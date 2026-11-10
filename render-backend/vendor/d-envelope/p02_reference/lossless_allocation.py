"""P02 internal synthetic allocation evidence; no public schema or authority."""
from copy import deepcopy
import json
from ai_engine_core.models import digest, SourceReference, HumanReviewRequirement
from ai_engine_core.validation import validate_result

class AllocationDenied(ValueError):
    pass

def require(ok, code):
    if not ok: raise AllocationDenied(code)

def positive(n):
    return type(n) is int and n > 0

def capture(record, results):
    """Preserve every original proposal and exact request/result/source relations."""
    require(type(record) is dict and record.get('operation') == 'schedule-recommendation', 'E2_RECORD_REQUIRED')
    inputs=record['core_inputs']; wire=record['wire_payload']; trials=wire['trials']
    require(len(inputs)==len(results)==len(trials) and bool(inputs), 'TRIAL_RESULT_COUNT')
    require(len({t['trial_id'] for t in trials})==len(trials), 'DUPLICATE_TRIAL')
    captured=[]; empty=[]
    for ordinal,(item,result,trial) in enumerate(zip(inputs,results,trials)):
        req=item['request'];p=req['request_payload'];tid=trial['trial_id']
        require(req['engine_id']==result['engine_id']=='E2' and p['trial_id']==tid, 'TRIAL_IDENTITY')
        require(req['request_id']==result['request_id'] and req['correlation_id']==result['correlation_id'], 'RESULT_IDENTITY')
        require(result['status']=='ADVISORY' and not result['errors'], 'CORE_NOT_ADVISORY')
        require(result['source_refs']==req['source_refs'], 'SOURCE_REFERENCE_CHANGED')
        require(result['audit_metadata']['input_digest']==digest(req) and result['audit_metadata']['output_digest']==digest(result['result_payload']), 'RESULT_DIGEST')
        validate_result('E2',result['result_payload'],tuple(SourceReference.parse(r) for r in req['source_refs']),HumanReviewRequirement(**result['requires_human_review']))
        require(positive(p['required_devices']) and p['required_devices']==trial.get('required_devices',1), 'REQUIRED_DEVICES')
        require(positive(p['samples']['count']) and p['samples']['count']==trial['quantity'], 'REQUESTED_QUANTITY')
        require(p['granularity']=='DAY' and wire['time_unit']=='day' and wire['timezone']=='Asia/Taipei', 'DAY_REQUIRED')
        equipment={m['id']:m for m in p['equipment']}
        require(len(equipment)==len(p['equipment']), 'DUPLICATE_EQUIPMENT')
        proposals=result['result_payload']['proposals']
        if not proposals: empty.append(tid)
        for index,proposal in enumerate(proposals):
            require(proposal['trial_id']==tid and proposal['start_date']==p['start_date'], 'PROPOSAL_TRIAL_DATE')
            require(proposal['granularity']=='DAY' and proposal['applied'] is False and proposal['requires_actual_pickup_confirmation'] is True, 'ADVISORY_ONLY')
            allocations=proposal['allocations'];ids=[a['equipment_id'] for a in allocations]
            require(len(ids)==len(set(ids))==p['required_devices'], 'DEVICE_COUNT_OR_DUPLICATE')
            require(all(i in equipment for i in ids), 'UNKNOWN_EQUIPMENT')
            require(all(positive(a['sample_count']) for a in allocations), 'POSITIVE_SAMPLE_COUNT')
            require(sum(a['sample_count'] for a in allocations)==p['samples']['count'], 'ALLOCATION_TOTAL')
            require(all(a['sample_count']<=equipment[a['equipment_id']]['max_samples'] for a in allocations), 'DEVICE_COUNT_CAPACITY')
            # Copies retain any future extra native fields rather than silently stripping them.
            relation={'trial_ordinal':ordinal,'trial_id':tid,'request_id':req['request_id'],'correlation_id':req['correlation_id'],
                      'candidate_index':index,'candidate_digest':digest(proposal),'request_digest':digest(req),'result_digest':digest(result['result_payload']),
                      'registry_fingerprint':record['fingerprint'],'registry_record_digest':record['record_digest']}
            captured.append({'candidate_id':digest(relation),'relation':relation,'required_devices':p['required_devices'],
                             'requested_quantity':p['samples']['count'],'source_refs':deepcopy(req['source_refs']),
                             'original_request':deepcopy(req),'original_result':deepcopy(result),'original_context':deepcopy(item['context']),
                             'original_proposal':deepcopy(proposal),'allocations':deepcopy(allocations),'timezone':'Asia/Taipei','time_unit':'day',
                             'evidence_level':'SYNTHETIC_ONLY','reservation_created':False,'business_state_modified':False})
    return {'schema_version':'P02_INTERNAL_DRAFT','candidates':captured,'empty_trial_ids':empty,
            'analysis_status':'INDETERMINATE' if empty else 'ADVISORY','full_enumeration':'NOT_PROVEN',
            'public_result':None,'job_terminal_state':None}

def project_provider_advice(bundle):
    """Known B DTO lacks mandatory allocation fields; never publish lossy success."""
    from b_dto_reference.schemas import ScheduleCandidate
    fields=set(ScheduleCandidate.model_fields)
    required={'allocations','required_devices','requested_quantity','source_relation'}
    missing=sorted(required-fields)
    if bundle['analysis_status']=='INDETERMINATE':
        return {'status':'INDETERMINATE','b_provider_advice':None,'public_result':None,'missing_fields':missing,'reason':'FULL_ENUMERATION_NOT_PROVEN'}
    require(bool(bundle['candidates']), 'CANDIDATES_REQUIRED')
    # This is a gate for the VERIFIED DTO version only, not a speculative future mapper.
    return {'status':'BLOCKED','b_provider_advice':None,'public_result':None,'missing_fields':missing,
            'reason':'B_PROVIDER_ADVICE_LOSSLESS_MAPPING_NOT_DEFINED',
            'missing_semantics':['per-device sample_count','per-candidate source/request/result relationship'],
            'formal_job_terminal_state':None}

def execute(operation, payload, *, registry=None):
    from input_mapper import execute as original_execute, map_input
    if operation!='schedule-recommendation':
        return original_execute(operation,payload,registry=registry)
    try:
        record=map_input(operation,deepcopy(payload),registry=registry)
        original=original_execute(operation,deepcopy(payload),registry=registry)
        if not original['core_results'] or original['status'] not in ('SUCCESS','INDETERMINATE'):
            return {'status':original['status'],'b_provider_advice':None,'public_result':None,'lossless_allocation':None,'original_bridge_result':original}
        bundle=capture(record,original['core_results'])
        projection=project_provider_advice(bundle)
        return {**projection,'lossless_allocation':bundle,
                'original_bridge_status':original['status'],'core_call_count':original['core_call_count'],
                'core_results':deepcopy(original['core_results']),'reservation_created':False,'business_state_modified':False}
    except Exception:
        # Never expose native errors/sidecars, and never fall back to old success.
        return {'status':'BLOCKED','reason':'INVALID_OR_UNVERIFIABLE_ALLOCATION','b_provider_advice':None,'public_result':None,'lossless_allocation':None}
