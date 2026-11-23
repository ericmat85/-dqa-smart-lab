"""Internal synthetic wire proposal, not a B/C approved schema or publication right."""
from copy import deepcopy
from typing import Annotated, Literal
import hashlib,json
from pydantic import BaseModel,ConfigDict,Field,StringConstraints,JsonValue,model_validator
from ai_engine_core.models import digest as native_digest
from lossless_allocation import capture
from ai_engine_core.models import EngineRequest
from candidate.quality import sources,capacity

Text=Annotated[str,StringConstraints(min_length=1,pattern=r'\S')]
Hex=Annotated[str,StringConstraints(pattern=r'^[0-9a-f]{64}$')]
Positive=Annotated[int,Field(strict=True,gt=0)]
class Denied(ValueError):pass

def canonical(value):
    # Python JSON profile candidate, NOT JCS/RFC8785. No coercion, NaN or Decimal fallback.
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf-8')
def sha(value):return hashlib.sha256(canonical(value)).hexdigest()
def raw_bytes_sha(value):
    if type(value) is not bytes:raise Denied('RAW_BYTES_REQUIRED')
    return hashlib.sha256(value).hexdigest()
class Strict(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
class Binding(Strict):
    # Exact names/types from verified B-P04 source/candidate/profiles.py:50-63.
    jobId:Text
    attemptId:Text
    snapshotId:Text
    snapshotRevision:Text
    sourceRevision:Text
    fenceToken:Text
    executionEpoch:Annotated[int,Field(strict=True,ge=1,le=9007199254740991)]
class SourceRef(Strict):
    document_id:Text
    version:Text
    locator:Text
    digest:Hex
class Allocation(Strict):
    equipment_id:Text
    sample_count:Positive
class Candidate(Strict):
    candidate_id:Hex
    trial_id:Text
    proposal_index:Annotated[int,Field(strict=True,ge=0)]
    required_devices:Positive
    requested_quantity:Positive
    allocations:tuple[Allocation,...]
    proposal_digest:Hex
    original_proposal:dict[str,JsonValue]
class Trial(Strict):
    trial_id:Text
    trial_index:Annotated[int,Field(strict=True,ge=0)]
    status:Literal['ADVISORY','INDETERMINATE','REFUSED']
    reasons:tuple[Text,...]
    required_devices:Positive
    requested_quantity:Positive
    source_status:Literal['SYNTHETIC_PRESENT','MISSING','INVALID']
    source_refs:tuple[SourceRef,...]
    request_digest:Hex
    result_digest:Hex|None
    original_request:dict[str,JsonValue]
    original_result:dict[str,JsonValue]|None
    candidates:tuple[Candidate,...]
class Envelope(Strict):
    wire_version:Literal['d-e2-allocation/0.1-proposed']
    approval:Literal['INTERNAL_DRAFT_NOT_APPROVED']
    binding:Binding
    digest_profile:Literal['SHA256_PY_JSON_SORTED_UTF8_COMPACT_V1_PROPOSED']
    native_digest_profile:Literal['EXISTING_D_CORE_MODELS_DIGEST']
    record_fingerprint:Hex
    record_digest:Hex
    original_record:dict[str,JsonValue]
    status:Literal['ADVISORY','INDETERMINATE','REFUSED']
    trials:tuple[Trial,...]
    integrity:Literal['CHECKED_SYNTHETIC_ONLY']
    source_trust:Literal['SYNTHETIC_ONLY']
    public_projection:Literal['BLOCKED']
    full_enumeration:Literal['NOT_PROVEN']
    digest:Hex
    @model_validator(mode='after')
    def consistency(self):
        check(self)
        return self

def candidate_identity(binding,fp,record_digest,index,trial_id,proposal_index,proposal_digest):
    return sha({'binding':binding.model_dump(mode='json'),'record_fingerprint':fp,'record_digest':record_digest,'trial_index':index,'trial_id':trial_id,'proposal_index':proposal_index,'proposal_digest':proposal_digest})
def require(ok,code):
    if not ok:raise Denied(code)

def evidence_problem(item):
    try:sources(EngineRequest.parse(item['request']),item['context'])
    except (ValueError,TypeError,KeyError):return 'INVALID_SOURCE'
    try:capacity(item['request']['request_payload'],item['context'])
    except (ValueError,TypeError,KeyError):return 'CAPACITY_EVIDENCE_MISSING_OR_INVALID'
    return None

def check(e):
    data=e.model_dump(mode='json');d=data.pop('digest');require(sha(data)==d,'ENVELOPE_DIGEST')
    record=e.original_record
    require(native_digest({'operation':record['operation'],'payload':record['wire_payload']})==e.record_fingerprint==record['fingerprint'],'RECORD_FINGERPRINT')
    unsigned=deepcopy(record);unsigned.pop('record_digest',None)
    require(native_digest(unsigned)==e.record_digest==record['record_digest'],'RECORD_DIGEST')
    inputs=record['core_inputs'];wire_trials=record['wire_payload']['trials']
    require(len(inputs)==len(wire_trials)==len(e.trials),'TRIAL_COMPLETENESS')
    require(len({t.trial_id for t in e.trials})==len(e.trials),'DUPLICATE_TRIAL')
    for i,t in enumerate(e.trials):
        req=inputs[i]['request'];p=req['request_payload'];w=wire_trials[i]
        require(t.trial_index==i and t.trial_id==p['trial_id']==w['trial_id'],'TRIAL_IDENTITY')
        require(t.original_request==req and t.request_digest==native_digest(req),'REQUEST_DIGEST')
        require(t.required_devices==p['required_devices']==w.get('required_devices',1) and t.requested_quantity==p['samples']['count']==w['quantity'],'DEMAND_IDENTITY')
        require([r.model_dump() for r in t.source_refs]==req['source_refs'],'SOURCE_REF_IDENTITY')
        if not req['source_refs']:
            require(t.status=='REFUSED' and t.source_status=='MISSING' and not t.candidates and 'MISSING_SOURCE' in t.reasons,'MISSING_SOURCE_FAIL_CLOSED')
            # Missing-source path retains any received result, but does not admit it as valid.
            require(t.result_digest==(native_digest(t.original_result['result_payload']) if t.original_result is not None else None),'REJECTED_RESULT_DIGEST')
            continue
        problem=evidence_problem(inputs[i])
        if problem:
            require(t.status=='REFUSED' and not t.candidates and t.reasons==(problem,) and t.source_status==('INVALID' if problem=='INVALID_SOURCE' else 'SYNTHETIC_PRESENT'),'INVALID_EVIDENCE_FAIL_CLOSED')
            require(t.result_digest==(native_digest(t.original_result['result_payload']) if t.original_result is not None else None),'REJECTED_RESULT_DIGEST')
            continue
        require(t.source_status=='SYNTHETIC_PRESENT','SOURCE_STATUS')
        if t.original_result is None:
            require(t.status=='REFUSED' and not t.candidates and t.result_digest is None and 'MISSING_RESULT' in t.reasons,'MISSING_RESULT_FAIL_CLOSED');continue
        r=t.original_result;require(t.result_digest==native_digest(r['result_payload']),'RESULT_DIGEST')
        # Reuse exact P02 validations; no new scheduling algorithm or extra B authority.
        sub=deepcopy(record);sub['core_inputs']=[inputs[i]];sub['wire_payload']['trials']=[w]
        bundle=capture(sub,[r]);expected=bundle['candidates']
        require(len(t.candidates)==len(expected),'CANDIDATE_COMPLETENESS')
        for j,(c,old) in enumerate(zip(t.candidates,expected)):
            proposal=old['original_proposal']
            require(c.trial_id==t.trial_id and c.proposal_index==j and c.original_proposal==proposal,'PROPOSAL_IDENTITY')
            require(c.proposal_digest==native_digest(proposal),'PROPOSAL_DIGEST')
            require(c.required_devices==t.required_devices and c.requested_quantity==t.requested_quantity,'CANDIDATE_DEMAND')
            # Original full proposal preserves unknown native allocation extension fields.
            require([a.model_dump() for a in c.allocations]==[{k:a[k] for k in ('equipment_id','sample_count')} for a in proposal['allocations']],'ALLOCATION_CHANGED')
            require(len({a.equipment_id for a in c.allocations})==len(c.allocations)==c.required_devices and sum(a.sample_count for a in c.allocations)==c.requested_quantity,'ALLOCATION_TOTAL')
            require(c.candidate_id==candidate_identity(e.binding,e.record_fingerprint,e.record_digest,i,t.trial_id,j,c.proposal_digest),'CANDIDATE_ID')
        require(t.status==('ADVISORY' if expected else 'INDETERMINATE'),'TRIAL_STATUS')
        require(t.reasons==(() if expected else ('NO_PROPOSALS_WITHOUT_COMPLETE_PROOF',)),'TRIAL_REASONS')
    status='REFUSED' if any(t.status=='REFUSED' for t in e.trials) else 'INDETERMINATE' if not e.trials or any(t.status=='INDETERMINATE' for t in e.trials) else 'ADVISORY'
    require(e.status==status,'OVERALL_STATUS')

def build(binding_raw,record,results):
    """Structural synthetic Binding echo only. No formal auth/source trust inferred."""
    binding=Binding.model_validate(binding_raw)
    record=deepcopy(record);results=deepcopy(results)
    require(type(record) is dict and record['operation']=='schedule-recommendation','E2_RECORD')
    inputs=record['core_inputs'];require(len(results)==len(inputs),'RESULT_SLOT_REQUIRED')
    trials=[]
    for i,(item,r) in enumerate(zip(inputs,results)):
        req=item['request'];p=req['request_payload'];tid=p['trial_id'];refs=tuple(SourceRef.model_validate(x) for x in req['source_refs'])
        common={'trial_id':tid,'trial_index':i,'required_devices':p['required_devices'],'requested_quantity':p['samples']['count'],
                'source_refs':refs,'request_digest':native_digest(req),'original_request':req,'original_result':r,
                'result_digest':native_digest(r['result_payload']) if r is not None else None}
        if not refs:
            trials.append(Trial(**common,status='REFUSED',reasons=('MISSING_SOURCE',),source_status='MISSING',candidates=()));continue
        problem=evidence_problem(item)
        if problem:
            trials.append(Trial(**common,status='REFUSED',reasons=(problem,),source_status='INVALID' if problem=='INVALID_SOURCE' else 'SYNTHETIC_PRESENT',candidates=()));continue
        if r is None:
            trials.append(Trial(**common,status='REFUSED',reasons=('MISSING_RESULT',),source_status='SYNTHETIC_PRESENT',candidates=()));continue
        sub=deepcopy(record);sub['core_inputs']=[item];sub['wire_payload']['trials']=[record['wire_payload']['trials'][i]]
        captured=capture(sub,[r]);candidates=[]
        for j,c in enumerate(captured['candidates']):
            proposal=c['original_proposal'];pd=native_digest(proposal)
            candidates.append(Candidate(candidate_id=candidate_identity(binding,record['fingerprint'],record['record_digest'],i,tid,j,pd),trial_id=tid,proposal_index=j,
                required_devices=p['required_devices'],requested_quantity=p['samples']['count'],proposal_digest=pd,original_proposal=proposal,
                allocations=tuple(Allocation.model_validate({k:a[k] for k in ('equipment_id','sample_count')}) for a in proposal['allocations'])))
        trials.append(Trial(**common,status='ADVISORY' if candidates else 'INDETERMINATE',reasons=() if candidates else ('NO_PROPOSALS_WITHOUT_COMPLETE_PROOF',),source_status='SYNTHETIC_PRESENT',candidates=tuple(candidates)))
    status='REFUSED' if any(t.status=='REFUSED' for t in trials) else 'INDETERMINATE' if not trials or any(t.status=='INDETERMINATE' for t in trials) else 'ADVISORY'
    data={'wire_version':'d-e2-allocation/0.1-proposed','approval':'INTERNAL_DRAFT_NOT_APPROVED','binding':binding,'digest_profile':'SHA256_PY_JSON_SORTED_UTF8_COMPACT_V1_PROPOSED','native_digest_profile':'EXISTING_D_CORE_MODELS_DIGEST',
          'record_fingerprint':record['fingerprint'],'record_digest':record['record_digest'],'original_record':record,'status':status,'trials':tuple(trials),
          'integrity':'CHECKED_SYNTHETIC_ONLY','source_trust':'SYNTHETIC_ONLY','public_projection':'BLOCKED','full_enumeration':'NOT_PROVEN'}
    # Compute wire seal from exact JSON representation, not strings containing JSON.
    serial={k:(v.model_dump(mode='json') if isinstance(v,BaseModel) else [t.model_dump(mode='json') for t in v] if k=='trials' else v) for k,v in data.items()}
    return Envelope(**data,digest=sha(serial))

def encode(e):
    # Revalidate even frozen outer models: raw evidence dicts remain mutable copies.
    raw=canonical(e.model_dump(mode='json'));Envelope.model_validate_json(raw);return raw

def decode(raw,*,expected_binding):
    require(type(raw) is bytes,'WIRE_BYTES_REQUIRED')
    # Reject duplicate JSON keys; no last-key-wins ambiguity.
    def unique(pairs):
        d={}
        for k,v in pairs:
            require(k not in d,'DUPLICATE_JSON_KEY');d[k]=v
        return d
    parsed=json.loads(raw,object_pairs_hook=unique,parse_constant=lambda x:(_ for _ in ()).throw(Denied('NONFINITE_JSON')))
    e=Envelope.model_validate_json(canonical(parsed));expected=Binding.model_validate(expected_binding)
    require(e.binding==expected,'BINDING_ECHO_MISMATCH');return e
