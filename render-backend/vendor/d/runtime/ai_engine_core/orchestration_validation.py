"""Closed model-output schema and policy checks; INTERNAL_DRAFT_NOT_APPROVED."""
import json
from .models import digest
from .simulation import SimulationPacket, SIMULATION_MARKER, ACTIONS

class OrchestrationFault(ValueError):
    def __init__(self,code,category):
        self.code,self.category=code,category
        super().__init__(category)

def demand(condition,category,code='INVALID_INPUT'):
    if not condition: raise OrchestrationFault(code,category)

def _pairs(pairs):
    obj={}
    for key,value in pairs:
        demand(key not in obj,'DUPLICATE_JSON_FIELD')
        obj[key]=value
    return obj

def _constant(value):
    raise OrchestrationFault('INVALID_INPUT','NONFINITE_MODEL_NUMBER')

# These keys have no authority in a model advisory, at any nesting level.
PROTECTED=frozenset(('approve','auto_approve','approval_status','technical_review',
    'technical_status','human_technical_review_status','supervisor_endorsement',
    'original_result','measurements','raw_data_digest','draft_data','signature',
    'forge_signature','proposals','applied','ignore_safety','granularity',
    'write_schedule','state_transition','result_payload','rule_result',
    'requires_human_review','rule_status','audit_metadata','model_metadata'))

def reject_protected(value):
    if isinstance(value,dict):
        for key,item in value.items():
            demand(key not in PROTECTED,'UNAUTHORIZED_MODEL_FIELD','POLICY_REJECTED')
            reject_protected(item)
    elif isinstance(value,list):
        for item in value:reject_protected(item)


def validate_model_output(packet,engine_id,correlation_id,rules):
    demand(isinstance(packet,SimulationPacket),'MODEL_PACKET_SCHEMA')
    demand(packet.marker==SIMULATION_MARKER,'MISSING_SIMULATION_MARKER','POLICY_REJECTED')
    demand(isinstance(packet.body,str),'MODEL_BODY_SCHEMA')
    demand(bool(packet.body.strip()),'EMPTY_MODEL_RESPONSE')
    demand(len(packet.body)<=100000,'MODEL_RESPONSE_TOO_LARGE')
    try:
        obj=json.loads(packet.body,object_pairs_hook=_pairs,parse_constant=_constant)
    except (json.JSONDecodeError,RecursionError):
        raise OrchestrationFault('INVALID_INPUT','INVALID_MODEL_JSON') from None
    reject_protected(obj)
    demand(isinstance(obj,dict),'MODEL_SCHEMA_MISMATCH')
    demand(all(k in obj for k in ('engine_id','correlation_id','advice')),'MISSING_MODEL_FIELD','MISSING_REQUIRED_FIELD')
    demand(set(obj)=={'engine_id','correlation_id','advice'},'UNKNOWN_MODEL_FIELD')
    demand(obj['engine_id']==engine_id,'ENGINE_ID_MISMATCH','POLICY_REJECTED')
    demand(obj['correlation_id']==correlation_id,'CORRELATION_ID_MISMATCH','POLICY_REJECTED')
    advice=obj['advice'];demand(isinstance(advice,dict),'MODEL_SCHEMA_MISMATCH')
    required={'action','note_codes','candidate_indices','citations'}
    demand(required.issubset(advice),'MISSING_MODEL_FIELD','MISSING_REQUIRED_FIELD')
    demand(set(advice)==required,'UNKNOWN_MODEL_FIELD')
    expected=ACTIONS[engine_id]
    if engine_id=='E4' and rules['retrieval_status']!='FOUND':expected='WITHHOLD_CONCLUSION'
    demand(advice['action']==expected,'UNAUTHORIZED_MODEL_ACTION','POLICY_REJECTED')
    notes=advice['note_codes']
    demand(isinstance(notes,list) and notes==['HUMAN_REVIEW_REQUIRED'],'UNVERIFIED_MODEL_NOTE','POLICY_REJECTED')
    indices=advice['candidate_indices']
    demand(isinstance(indices,list) and all(type(i) is int for i in indices),'CANDIDATE_SCHEMA')
    if engine_id=='E2':
        demand(len(set(indices))==len(indices) and all(0<=i<len(rules['proposals']) for i in indices),'UNSAFE_SCHEDULING_RECOMMENDATION','POLICY_REJECTED')
    else:demand(not indices,'UNAUTHORIZED_CANDIDATE','POLICY_REJECTED')
    cites=advice['citations'];demand(isinstance(cites,list),'CITATION_SCHEMA')
    if engine_id=='E4':
        if rules['retrieval_status']=='FOUND':
            demand(bool(cites),'MISSING_VERIFIED_CITATION','SOURCE_NOT_FOUND')
            # Exact rule-verified ref + quote: version, section, digest and
            # content must all match. Model cannot expand the source set.
            demand(all(c in rules['citations'] for c in cites),'UNVERIFIED_CITATION','SOURCE_NOT_FOUND')
            demand(len({digest(c) for c in cites})==len(cites),'DUPLICATE_CITATION')
        else:demand(not cites,'UNVERIFIED_CITATION','SOURCE_NOT_FOUND')
    else:demand(not cites,'UNVERIFIED_CITATION','SOURCE_NOT_FOUND')
    return {'marker':packet.marker,**obj}
