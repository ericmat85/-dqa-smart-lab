from dataclasses import replace
import ast
from pathlib import Path
from uuid import uuid4
import pytest
from app.authz.deny import DenyByDefaultEvaluator
from app.authz.interfaces import PermissionDecision
from app.core.errors import AuthorizationError,RuleNotApprovedError
from app.domain.workflow import transition,authorize
from app.domain.permissions import Role
from app.domain.states import Stage,Substate
from app.schemas.commands import ResubmitRequest,ApproveRequest,ForceInterrupt
from app.schemas.requests import ReviewRecord
from conftest import actor,state,signature,NOW,AllowForTest


def test_default_evaluator_denies_even_trusted_context(case):
    with pytest.raises(AuthorizationError):transition(case,ResubmitRequest(action='resubmit_request',expected_version=1,idempotency_key='synthetic'),actor(case,Role.REQUESTER),DenyByDefaultEvaluator(),event_id=uuid4(),now=NOW)


@pytest.mark.parametrize('change',['tenant','suspended','case_scope','missing','admin'])
def test_authorization_negative(case,change):
    who=actor(case,Role.REQUESTER)
    if change=='tenant':who=replace(who,tenant_id=uuid4())
    if change=='suspended':who=replace(who,membership_active=False)
    if change=='case_scope':who=replace(who,case_ids=frozenset())
    if change=='missing':who=None
    if change=='admin':who=actor(case,Role.ADMIN)
    with pytest.raises(AuthorizationError):transition(case,ResubmitRequest(action='resubmit_request',expected_version=1,idempotency_key='synthetic'),who,AllowForTest(),event_id=uuid4(),now=NOW)


def test_unknown_permission_denied_before_evaluator(case):
    with pytest.raises(AuthorizationError):authorize(case,actor(case,Role.REQUESTER),AllowForTest(),'unknown')


def test_cross_level_with_multiple_roles_denied(case):
    case=state(case,substate=Substate.REQUEST_LEVEL2)
    who=actor(case,Role.LEVEL2)
    who=replace(who,roles=frozenset({Role.LEVEL1,Role.LEVEL2,Role.ADMIN}))
    case=state(case,reviews=(ReviewRecord(actor_id=who.actor_id,level=1,round_number=1,decision='approve'),))
    with pytest.raises(AuthorizationError):transition(case,ApproveRequest(action='approve_request',signature=signature(who.actor_id),expected_version=1,idempotency_key='synthetic'),who,AllowForTest(),event_id=uuid4(),now=NOW)


def test_self_review_denied_even_with_correct_role(case):
    case=state(case,substate=Substate.REQUEST_LEVEL1)
    who=actor(case,Role.LEVEL1,case.requester_id)
    with pytest.raises(AuthorizationError):transition(case,ApproveRequest(action='approve_request',signature=signature(who.actor_id),expected_version=1,idempotency_key='synthetic'),who,AllowForTest(),event_id=uuid4(),now=NOW)


def test_interrupt_requires_schedule_edit(case):
    class NoEdit:
        def evaluate(self,actor,scope,permission):return PermissionDecision(permission.value!='edit_schedule')
    case=state(case,stage=Stage.RUNNING,substate=Substate.RUNNING)
    with pytest.raises(AuthorizationError):transition(case,ForceInterrupt(action='force_interrupt_trial',reservation_id=case.reservation_ids[0],reason='synthetic',expected_version=1,idempotency_key='synthetic'),actor(case,Role.LEVEL1),NoEdit(),event_id=uuid4(),now=NOW)


def test_no_production_assert():
    for path in (Path(__file__).parents[1]/'app').rglob('*.py'):
        assert not any(isinstance(node,ast.Assert) for node in ast.walk(ast.parse(path.read_text()))),path


@pytest.mark.parametrize('change',[
    {'roles':frozenset({'admin'})},
    {'roles':{Role.ADMIN}},
    {'membership_active':1},
    {'case_ids':frozenset({'not-a-uuid'})},
])
def test_trusted_context_rejects_untyped_or_mutable_fields(case,change):
    with pytest.raises(ValueError):replace(actor(case,Role.REQUESTER),**change)
