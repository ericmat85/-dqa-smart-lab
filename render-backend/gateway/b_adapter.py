"""I-owned adapter around fixed B validation + D Core/Mapper. Not B Public API."""
from pathlib import Path
from copy import deepcopy
import json,sys
from pydantic import ValidationError
from gateway.adapter import ROOT
from app.competition.schemas import RequestReviewRequest,ReportReviewRequest,ScheduleRequest,AssistantRequest
sys.path.insert(0,str(ROOT/'vendor/d-mapper'))
from input_mapper import execute
from gateway.c_mapping import map_native
REGISTRY=json.loads((ROOT/'vendor/d-mapper/synthetic_registry.json').read_text())
DEFAULTS={'E1':'e1_registered_match','E2':'e2_exact_fraction','E3':'e3_registered_complete','E4':'e4_registered_match'}
ENGINES={'request-review':'E1','schedule-recommendation':'E2','report-review':'E3','assistant':'E4'}
B_MODELS={'E1':RequestReviewRequest,'E2':ScheduleRequest,'E3':ReportReviewRequest,'E4':AssistantRequest}

def run_paired(engine,trace,fixture=None):
    name=fixture or DEFAULTS[engine]
    matches=[r for r in REGISTRY['entries'] if r['fixture_name']==name and ENGINES[r['operation']]==engine]
    if len(matches)!=1:raise ValueError('FIXTURE_NOT_ALLOWED')
    rec=deepcopy(matches[0]);payload=rec['wire_payload']
    try:
        validated=B_MODELS[engine].model_validate(payload)
        if validated.model_dump(mode='json')!=payload:raise ValueError('B_COERCION_FORBIDDEN')
        b=dict(status='ORIGINAL_B_DTO_VALID',errors=[])
    except ValidationError as exc:
        b=dict(status='B_DTO_VERSION_GAP_D_REFERENCE_ONLY',errors=[dict(path=list(e['loc']),type=e['type']) for e in exc.errors()])
        if engine=='E4':
            # Original B's bounded text context is validated as a view only.
            # Forward the unchanged versioned D input separately; never discard
            # revisions/locators or pretend B's older DTO carries those fields.
            view=dict(schema_version=payload['schema_version'],synthetic=payload['synthetic'],question=payload['question'],context=[d['text'] for d in payload['documents']])
            validated=AssistantRequest.model_validate(view)
            if validated.model_dump(mode='json')!=view:raise ValueError('B_COERCION_FORBIDDEN')
            b.update(status='ORIGINAL_B_VIEW_VALID_D_REFERENCE_SOURCE_BINDING',validated_view=validated.model_dump(mode='json'),wire_compatibility='PARTIAL_DOCUMENTS_VS_CONTEXT',full_versioned_input_preserved=True)
    # Original D map_input performs its own fixed supplemental B-reference DTO
    # and full fingerprint registry validation; no fabricated admission/binding.
    result=execute(rec['operation'],payload,registry=deepcopy(REGISTRY))
    require_calls=result['core_call_count']
    if result['fake_model_called'] or result['real_provider_called']:raise RuntimeError('PROVIDER_BOUNDARY')
    mapped=[map_native(engine,native,item['request']) for native,item in zip(result['core_results'],rec['core_inputs'])]
    return dict(engine=engine,scope='REGISTERED_SYNTHETIC_PAIRED_FIXTURE_NOT_CURRENT_CASE',fixture_id=name,
        trace_id=trace,b_adapter=b,core_called=require_calls>0,core_call_count=require_calls,
        execution_mode='REAL_OFFLINE_RULES_CORE_NO_PROVIDER',
        source_pairing='CORE_MAPPER:e1b2faefec412dfc061e45595bc8f06aa1119543;ZIP:5577987950666213bfa566b4ff095d4c27e0cdf46519015958d18cefd1cb385c',
        trace_bindings=[dict(sandbox_trace_id=trace,native_correlation_id=r['correlation_id'],input_digest=r['audit_metadata']['input_digest'],output_digest=r['audit_metadata']['output_digest']) for r in result['core_results']],
        legacy_mapper_output=result,legacy_usage_label='RETAINED_D_DTO_FAKE_OFFLINE_LABEL_IS_NOT_EXECUTION_PROOF;NO_PROVIDER_CALLED',
        contract_mappings=mapped,human_final_decision=True,public_api_publication='BLOCKED',case_state_modified=False)
