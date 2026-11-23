"""Direct-call D-stage bridge; no API, Factory, Job, Provider or database."""
from copy import deepcopy
from pydantic import ValidationError as DTOValidationError
from b_dto_reference.schemas import RequestReviewRequest,ReportReviewRequest,ScheduleRequest,AssistantRequest
from ai_engine_core.models import EngineRequest,digest
from ai_engine_core.service import EngineCore
from source_context import BridgeFault,need,resolve,load_registry,fingerprint,exact_native_litres
MODELS={'request-review':RequestReviewRequest,'report-review':ReportReviewRequest,'schedule-recommendation':ScheduleRequest,'assistant':AssistantRequest}
ENGINES={'request-review':'E1','schedule-recommendation':'E2','report-review':'E3','assistant':'E4'}

def map_input(operation,payload,*,registry=None):
    need(type(operation) is str and operation in MODELS,'UNSUPPORTED_OPERATION')
    need(type(payload) is dict,'PAYLOAD_OBJECT_REQUIRED')
    need(payload.get('synthetic') is True and type(payload.get('synthetic')) is bool,'SYNTHETIC_ONLY')
    try:MODELS[operation].model_validate(deepcopy(payload))
    except DTOValidationError:raise BridgeFault('BLOCKED','B_REQUEST_DTO_INVALID') from None
    try:rec=resolve(operation,payload,load_registry() if registry is None else registry)
    except (TypeError,ValueError,KeyError) as e:
        if isinstance(e,BridgeFault):raise
        raise BridgeFault('INVALID_SOURCE','REGISTRY_INVALID') from None
    for x in rec['core_inputs']:
        need(x['request']['engine_id']==ENGINES[operation],'REGISTRY_ENGINE_MISMATCH','INVALID_SOURCE')
        EngineRequest.parse(x['request'])
    need(bool(rec['core_inputs']),'CORE_INPUT_MISSING')
    if operation=='request-review':
        p=rec['core_inputs'][0]['request']['request_payload']
        need(p['request']['product']==payload['product_code'] and p['request']['quantity']==payload['quantity'],'E1_PAYLOAD_BINDING','INVALID_SOURCE')
    elif operation=='schedule-recommendation':
        need(len(rec['core_inputs'])==len(payload['trials']),'TRIAL_INPUT_COUNT','INVALID_SOURCE')
        for t,x in zip(payload['trials'],rec['core_inputs']):
            p=x['request']['request_payload']
            need(p['trial_id']==t['trial_id'] and p['start_date']==t['start_date'] and p['duration_days']==t['duration_days'] and p['required_devices']==t.get('required_devices',1) and p['samples']['count']==t['quantity'],'TRIAL_PAYLOAD_BINDING','INVALID_SOURCE')
            need(p['granularity']=='DAY' and payload['time_unit']=='day' and payload['timezone']=='Asia/Taipei','DAY_BINDING','INVALID_SOURCE')
            need(p['samples']['volume_l']==exact_native_litres(t['sample_volume_litres']),'DECIMAL_PAYLOAD_BINDING','INVALID_SOURCE')
            need({m['id'] for m in p['equipment']}=={m['resource_id'] for m in payload['equipment']},'EQUIPMENT_PAYLOAD_BINDING','INVALID_SOURCE')
            for m in p['equipment']:
                w=next(v for v in payload['equipment'] if v['resource_id']==m['id'])
                need(m['usable_volume_l']==exact_native_litres(w['usable_volume_litres']) and m['max_samples']==w['capacity'],'CAPACITY_PAYLOAD_BINDING','INVALID_SOURCE')
    elif operation=='report-review':
        need(rec['sidecar']['original_cells']==payload['cells'],'CELL_PAYLOAD_BINDING','INVALID_SOURCE')
    elif operation=='assistant':
        p=rec['core_inputs'][0]['request']['request_payload']
        need(p['query']==payload['question'] and p['fixture_only'] is True and p['version_policy']=='EXACT','QUESTION_PAYLOAD_BINDING','INVALID_SOURCE')
        need(len(p['documents'])==len(payload['documents']),'DOCUMENT_PAYLOAD_BINDING','INVALID_SOURCE')
        for d,w in zip(p['documents'],payload['documents']):
            need(d['text']==w['text'] and d['ref']['version']==w['revision'] and d['ref']['locator']==w['locator'],'DOCUMENT_PAYLOAD_BINDING','INVALID_SOURCE')
    return rec

def response(operation,status,*,advice=None,errors=None,core=None,trace=None,fp=None,original=None):
    operation=operation if type(operation) is str and operation in MODELS else None
    return {'bridge_version':'d-stage-0.1','mode':'SYNTHETIC_CORE_RULES_ONLY','operation':operation if operation in MODELS else None,'engine_id':ENGINES.get(operation),
        'status':status,'b_provider_advice':deepcopy(advice),'b_dto_ready':status=='SUCCESS','b_adapter_action':'VALIDATE_AND_WRAP_OFFLINE_ONLY' if status=='SUCCESS' else 'NON_SUCCESS_MAPPING_REQUIRED',
        'errors':errors or [],'core_results':deepcopy(core or []),'core_execution_trace':deepcopy(trace or []),'core_call_count':len(trace or []),'request_fingerprint':fp,
        'preserved_input':deepcopy(original),'public_response':None,'customer_authorization':'UNVERIFIED','requires_human_confirmation':True,
        'business_state_modified':False,'reservation_created':False,'formal_job_terminal_state':None,'real_provider_called':False,'fake_model_called':False,
        'token_usage':None,'cost':None,'provider_model':None,'infeasibility_proof':'NOT_IMPLEMENTED','formal_v02_handoff':'BLOCKED','internal_contract_approval':'NOT_APPROVED'}

def execute(operation,payload,*,registry=None):
    original=deepcopy(payload);trace=[];core=[];fp=None
    try:
        rec=map_input(operation,payload,registry=registry);fp=rec['fingerprint']
        for x in rec['core_inputs']:
            native=deepcopy(x['request'])
            result=EngineCore().run(native,actor_id='SYNTH-D-STAGE',occurred_at='2026-11-08T12:00:00+08:00')
            trace.append({'engine_id':result.engine_id,'input_digest':result.audit_metadata['input_digest'],'output_digest':result.audit_metadata['output_digest'],'native_schema_version':result.schema_version,'core_status':result.status,'implementation':'existing_ai_engine_core.service.EngineCore.run'})
            need(result.audit_metadata['input_digest']==digest(native),'CORE_AUDIT_INPUT_MISMATCH','INVALID_SOURCE')
            core.append(result.to_dict())
            if result.status!='ADVISORY':raise BridgeFault('BLOCKED','NATIVE_CORE_REJECTED')
        from result_mapper import map_result
        advice=map_result(operation,rec,core)
        need(payload==original,'INPUT_MUTATED','INVALID_SOURCE')
        return response(operation,'SUCCESS',advice=advice,core=core,trace=trace,fp=fp,original=original if fp else None)
    except BridgeFault as e:status,code=e.status,e.code
    except Exception:status,code='BLOCKED','BRIDGE_INVALID_INPUT_OR_RESULT'
    return response(operation,status,errors=[{'code':code,'message':'Synthetic bridge withheld; no business action performed.'}],core=core,trace=trace,fp=fp,original=original if fp else None)
