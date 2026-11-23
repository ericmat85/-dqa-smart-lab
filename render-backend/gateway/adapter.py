"""I-owned SANDBOX adapter. Uses verified B DTO/transition, never B public routes."""
from pathlib import Path
import sys, json, hashlib
from uuid import UUID, uuid4
from datetime import datetime, timezone
from copy import deepcopy
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'vendor/b'))
sys.path.insert(0,str(ROOT/'vendor/d/runtime'))
sys.path.insert(0,str(ROOT/'vendor/d/dynamic'))
from app.schemas.requests import CaseState
from app.competition.schemas import RequestReviewRequest
from app.domain.states import Stage, Substate
from app.domain.permissions import Role, Permission
from app.authz.interfaces import ActorContext, PermissionDecision
from app.domain.workflow import transition
from app.schemas.commands import ApproveRequest
from app.schemas.common import SignatureRef
from app.core.errors import AuthorizationError, InvalidTransitionError, RuleNotApprovedError
import build_cases
import dynamic_adapter
from ai_engine_core.service import EngineCore
build_cases.SOURCE=ROOT/'vendor/d/dataset/data/competition_ai4_demo_dataset_v1.json'
_,FIXTURES=build_cases.cases()
IDS={name:UUID(int=i) for i,name in enumerate(['requester','manager','level1','level2','outsider'],10)}
TENANT=UUID(int=1)
ROLES={'requester':Role.REQUESTER,'manager':Role.REQUEST_MANAGER,'level1':Role.LEVEL1,'level2':Role.LEVEL2}
class SandboxEvaluator:
    def evaluate(self,actor,scope,permission):
        expected={scope.supervisor_id:Role.REQUEST_MANAGER,IDS['level1']:Role.LEVEL1,IDS['level2']:Role.LEVEL2}
        return PermissionDecision(permission==Permission.REVIEW_REQUEST and expected.get(actor.actor_id) in actor.roles,'SANDBOX_ONLY_SYNTHETIC_POLICY')

def create_case(case_id):
    # A synthetic proposal snapshot, never committed as B business state.
    return CaseState(request_id=case_id,tenant_id=TENANT,requester_id=IDS['requester'],supervisor_id=IDS['manager'],assignee_ids=frozenset(),stage=Stage.SIGNOFF,substate=Substate.PENDING_SIGNOFF,version=1)

def approve(case,identity):
    who=ActorContext(IDS[identity],TENANT,True,frozenset({ROLES[identity]}),frozenset({case.request_id}))
    cmd=ApproveRequest(action='approve_request',expected_version=case.version,idempotency_key=uuid4().hex,
        signature=SignatureRef(artifact_id=uuid4(),sha256=hashlib.sha256(b'SYNTHETIC_SIGNATURE_REFERENCE_NOT_AUTHORITY').hexdigest(),signer_id=who.actor_id))
    return transition(case,cmd,who,SandboxEvaluator(),event_id=uuid4(),now=datetime.now(timezone.utc))

def validate_request(data):
    return RequestReviewRequest.model_validate(data)

def run_engine(engine,trace,case=None,fixture_id=None):
    if fixture_id:
        candidates=[f for f in FIXTURES if f['caseId']==fixture_id and f['engine']==engine]
    else:candidates=[f for f in FIXTURES if f['engine']==engine and f['caseId']==f'DYN-001-{engine}']
    if len(candidates)!=1:raise ValueError('FIXTURE_NOT_ALLOWED')
    f=deepcopy(candidates[0]);raw=f['raw'];ctx=f['context']
    raw['correlation_id']=trace
    if case:
        raw['request_id']=str(case['state'].request_id)
        if engine=='E1':
            raw['request_payload']['request']['product']=case['request']['product_code']
            raw['request_payload']['request']['quantity']=case['request']['quantity']
        if engine=='E2':ctx.pop('capacityEvidence',None)
        if engine=='E3':ctx['requestId']=raw['request_id']
    out=dynamic_adapter.run(raw,ctx)
    from gateway.contract import validate_native
    contract_check=validate_native(engine,out.get("coreOutput"))
    from gateway.c_mapping import map_native
    mapping=map_native(engine,out.get("coreOutput"),raw)
    return dict(engine=engine,scope='COMPLETE_SYNTHETIC_FIXTURE' if fixture_id else 'CASE_SYNTHETIC_ADVISORY',fixture_id=fixture_id,
        source_version='D-final@4fb5abb60ce6daaf3305335c0a62704eb96a1294;dynamic_manifest=3b135c60b587967309c034d68bcd5037e3c0a486dd35a5287108e6f5ac784273',
        result=out,c_mapping=mapping,contract_validation=contract_check,human_final_decision=True,c_public_projection='BLOCKED_CONTRACT_AUTHORITY_GAP',
        display_message='資料不足，無法確認排程可行性' if engine=='E2' and not out['coreCalled'] else 'SYNTHETIC_DEMO 離線規則建議；人工最終決策')
