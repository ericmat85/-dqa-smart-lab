from datetime import timedelta
from uuid import uuid4
from hashlib import sha256
import pytest
from app.domain.workflow import transition,IdempotencyRecord,require_committable_business_operation
from app.domain.states import Stage,Substate,stage_four_display
from app.domain.permissions import Role
from app.schemas.commands import (ResubmitRequest,ApproveRequest,ReturnRequest,MarkElapsed,ConfirmComplete,
                                  ForceInterrupt,PendingRule)
from app.schemas.requests import ReviewRecord
from app.core.errors import (RuleNotApprovedError,VersionConflictError,IdempotencyConflictError,AuthorizationError,InvalidTransitionError)
from conftest import NOW,actor,state,signature,AllowForTest


def apply(case,cmd,who,**kw):return transition(case,cmd,who,AllowForTest(),event_id=uuid4(),now=NOW,**kw)

def base(case,key='synthetic'):return {'expected_version':case.version,'idempotency_key':key}


def test_d01_resubmit_supervisor_level1_level2(case):
    original=case.model_dump_json()
    case=apply(case,ResubmitRequest(action='resubmit_request',**base(case)),actor(case,Role.REQUESTER)).state
    assert case.stage==Stage.SIGNOFF
    assert case.round_number==2
    for role,expected in [(Role.REQUEST_MANAGER,Stage.REVIEW),(Role.LEVEL1,Stage.REVIEW),(Role.LEVEL2,Stage.SCHEDULING)]:
        who=actor(case,role)
        case=apply(case,ApproveRequest(action='approve_request',signature=signature(who.actor_id),**base(case)),who).state
        assert case.stage==expected
    assert len(case.events)==4
    assert len(case.reviews)==3
    assert 'returned' in original


def test_return_then_active_resubmit_preserves_history(case):
    case=state(case,substate=Substate.REQUEST_LEVEL1)
    who=actor(case,Role.LEVEL1)
    returned=apply(case,ReturnRequest(action='return_request',reason='synthetic reason',**base(case)),who).state
    assert returned.substate==Substate.RETURNED
    assert len(returned.events)==1
    assert returned.events[-1].reason=='synthetic reason'
    resub=apply(returned,ResubmitRequest(action='resubmit_request',**base(returned)),actor(returned,Role.REQUESTER)).state
    assert resub.reviews==returned.reviews
    assert resub.events[:1]==returned.events


def test_d02_same_level_new_round_allowed(case):
    who=actor(case,Role.LEVEL1)
    case=state(case,substate=Substate.REQUEST_LEVEL1,round_number=2,
        reviews=(ReviewRecord(actor_id=who.actor_id,level=1,round_number=1,decision='return'),))
    assert apply(case,ApproveRequest(action='approve_request',signature=signature(who.actor_id),**base(case)),who).state.substate==Substate.REQUEST_LEVEL2


def test_d04_elapsed_never_completes_or_sets_actual_hours(case):
    case=state(case,stage=Stage.RUNNING,substate=Substate.RUNNING)
    who=actor(case,Role.ENGINEER)
    result=apply(case,MarkElapsed(action='mark_elapsed',**base(case)),who)
    assert result.state.stage==Stage.RUNNING
    assert result.state.substate==Substate.AWAITING_COMPLETION
    complete=apply(result.state,ConfirmComplete(action='confirm_trial_complete',**base(result.state)),who)
    assert complete.state.stage==Stage.REPORT_PROCESSING
    assert not complete.side_effects_authorized
    with pytest.raises(RuleNotApprovedError):require_committable_business_operation(complete)
    assert complete.state.execution_record_ids==case.execution_record_ids


def test_complete_before_elapsed_marker_rejected(case):
    case=state(case,stage=Stage.RUNNING,substate=Substate.RUNNING)
    with pytest.raises(InvalidTransitionError):apply(case,ConfirmComplete(action='confirm_trial_complete',**base(case)),actor(case,Role.ENGINEER))


def test_elapsed_before_due_rejected(case):
    case=state(case,stage=Stage.RUNNING,substate=Substate.RUNNING,planned_end=NOW+timedelta(hours=1))
    with pytest.raises(InvalidTransitionError):apply(case,MarkElapsed(action='mark_elapsed',**base(case)),actor(case,Role.ENGINEER))


def test_d05_display():
    assert stage_four_display(False)==('已排程','待確認','待開始')
    assert stage_four_display(True)==('已排程','已確認','待開始')


def test_interrupt_only_one_reservation_and_preserves_execution(case):
    case=state(case,stage=Stage.RUNNING,substate=Substate.RUNNING)
    result=apply(case,ForceInterrupt(action='force_interrupt_trial',reservation_id=case.reservation_ids[0],reason='synthetic outage',**base(case)),actor(case,Role.LEVEL1))
    assert result.state.cancelled_reservation_ids==(case.reservation_ids[0],)
    assert case.reservation_ids[1] not in result.state.cancelled_reservation_ids
    assert result.state.stage==Stage.RUNNING and result.state.substate==Substate.INTERRUPTED
    assert result.state.execution_record_ids==case.execution_record_ids
    assert result.event.reason=='synthetic outage'
    assert not result.side_effects_authorized


@pytest.mark.parametrize('action',['early_complete','release_equipment','record_actual_hours','backdate_time',
    'reschedule_interrupted_trial','confirm_rescheduled_receipt','credit_hours','request_interruption',
    'cancel_request','cancel_arrangement','pause_trial','resume_trial'])
def test_pending_rules_deny_without_mutation(case,action):
    before=case.model_dump_json()
    with pytest.raises(RuleNotApprovedError):apply(case,PendingRule(action=action,**base(case)),actor(case,Role.ADMIN))
    assert case.model_dump_json()==before


def test_stale_version_does_not_append(case):
    before=case.events
    with pytest.raises(VersionConflictError):apply(case,ResubmitRequest(action='resubmit_request',expected_version=2,idempotency_key='synthetic'),actor(case,Role.REQUESTER))
    assert case.events==before


def test_idempotency_same_payload_replays_prior_result(case):
    who=actor(case,Role.REQUESTER);cmd=ResubmitRequest(action='resubmit_request',**base(case))
    result=apply(case,cmd,who)
    prior=IdempotencyRecord(tenant_id=case.tenant_id,actor_id=who.actor_id,request_id=case.request_id,
        key=cmd.idempotency_key,payload_sha256=sha256(cmd.model_dump_json().encode()).hexdigest(),result=result)
    replay=apply(result.state,cmd,who,prior=prior)
    assert replay==result
    assert len(replay.state.events)==1
    changed=ResubmitRequest(action='resubmit_request',expected_version=2,idempotency_key=cmd.idempotency_key)
    with pytest.raises(IdempotencyConflictError):apply(result.state,changed,who,prior=prior)


def test_idempotency_record_wrong_result_scope_rejected(case):
    who=actor(case,Role.REQUESTER);cmd=ResubmitRequest(action='resubmit_request',**base(case))
    result=apply(case,cmd,who)
    other=state(result.state,request_id=uuid4())
    malformed=result.model_copy(update={'state':other})
    record=IdempotencyRecord(tenant_id=case.tenant_id,actor_id=who.actor_id,request_id=case.request_id,
        key=cmd.idempotency_key,payload_sha256=sha256(cmd.model_dump_json().encode()).hexdigest(),result=malformed)
    with pytest.raises(IdempotencyConflictError):apply(case,cmd,who,prior=record)


def test_failed_approval_cannot_mutate_history(case):
    case=state(case,substate=Substate.REQUEST_LEVEL1)
    before=case.model_dump_json()
    who=actor(case,Role.LEVEL1,case.requester_id)
    with pytest.raises(AuthorizationError):
        apply(case,ApproveRequest(action='approve_request',signature=signature(who.actor_id),**base(case)),who)
    assert case.model_dump_json()==before


def test_transition_cannot_claim_authorized_side_effects(case):
    from pydantic import ValidationError
    from app.domain.workflow import WorkflowTransition
    result=apply(case,ResubmitRequest(action='resubmit_request',**base(case)),actor(case,Role.REQUESTER))
    with pytest.raises(ValidationError):
        WorkflowTransition(state=result.state,event=result.event,side_effects_authorized=True)
