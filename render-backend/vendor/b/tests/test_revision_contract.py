from dataclasses import replace
from uuid import uuid4
import pytest
from pydantic import ValidationError
from app.core.errors import InvalidTransitionError,AuthorizationError
from app.domain.states import Stage,Substate
from app.domain.permissions import Role
from app.domain.workflow import transition
from app.schemas.commands import ReturnReport,SubmitReport,ApproveReport
from conftest import actor,state,signature,revision,NOW,AllowForTest


def apply(case,cmd,who):return transition(case,cmd,who,AllowForTest(),event_id=uuid4(),now=NOW)
def base(case):return dict(expected_version=case.version,idempotency_key='synthetic')


def test_d03_new_revision_preserves_old_hash_and_signatures(case):
    old=revision().model_copy(update={'signatures':(signature(next(iter(case.assignee_ids))),)})
    case=state(case,stage=Stage.REPORT_VIEW,substate=Substate.REPORT_VIEW,reports=(old,))
    returned=apply(case,ReturnReport(action='return_report',content_revision_id=old.content_revision_id,reason=' correction ',**base(case)),actor(case,Role.REQUEST_MANAGER)).state
    assert returned.stage==Stage.REPORT_PROCESSING
    assert returned.reports==(old,)
    assert returned.events[-1].reason=='correction'
    who=actor(case,Role.ENGINEER)
    new=revision(2)
    submitted=apply(returned,SubmitReport(action='submit_report_revision',revision=new,executor_signature=signature(who.actor_id),**base(returned)),who).state
    assert submitted.stage==Stage.REPORT_REVIEW
    assert submitted.substate==Substate.REPORT_LEVEL2
    assert submitted.reports[0]==old
    assert submitted.reports[0].original.sha256=='b'*64
    assert submitted.reports[-1].content_revision_id!=old.content_revision_id
    assert submitted.version!=submitted.reports[-1].revision_number
    for role,expected in [(Role.LEVEL2,Substate.REPORT_LEVEL3),(Role.LEVEL3,Substate.REPORT_VIEW)]:
        reviewer=actor(submitted,role)
        submitted=apply(submitted,ApproveReport(action='approve_report',content_revision_id=new.content_revision_id,signature=signature(reviewer.actor_id),**base(submitted)),reviewer).state
        assert submitted.substate==expected
    assert len(submitted.reviews)==3
    assert submitted.reviews[0].decision=="return_report"
    assert submitted.reports[0]==old


def test_immutable_reference(case):
    ref=revision()
    with pytest.raises(ValidationError):ref.content_revision_id=uuid4()
    with pytest.raises(ValidationError):ref.original.sha256='c'*64


def test_old_revision_and_signature_reuse_rejected(case):
    who=actor(case,Role.ENGINEER);sig=signature(who.actor_id)
    old=revision().model_copy(update={'signatures':(sig,)})
    case=state(case,stage=Stage.REPORT_PROCESSING,substate=Substate.RETURNED,reports=(old,))
    for ref,sign in [(old,sig),(revision(2),sig)]:
        with pytest.raises(InvalidTransitionError):apply(case,SubmitReport(action='submit_report_revision',revision=ref,executor_signature=sign,**base(case)),who)


def test_no_report_submission_while_waiting_completion(case):
    case=state(case,stage=Stage.RUNNING,substate=Substate.AWAITING_COMPLETION)
    who=actor(case,Role.ENGINEER)
    with pytest.raises(InvalidTransitionError):apply(case,SubmitReport(action='submit_report_revision',revision=revision(),executor_signature=signature(who.actor_id),**base(case)),who)


def test_return_report_wrong_supervisor_and_stale_content(case):
    ref=revision();case=state(case,stage=Stage.REPORT_VIEW,substate=Substate.REPORT_VIEW,reports=(ref,))
    with pytest.raises(AuthorizationError):apply(case,ReturnReport(action='return_report',content_revision_id=ref.content_revision_id,reason='synthetic',**base(case)),actor(case,Role.REQUEST_MANAGER,uuid4()))
    with pytest.raises(InvalidTransitionError):apply(case,ReturnReport(action='return_report',content_revision_id=uuid4(),reason='synthetic',**base(case)),actor(case,Role.REQUEST_MANAGER))


def test_new_executor_signature_is_required(case):
    with pytest.raises(ValidationError):
        SubmitReport(action='submit_report_revision',revision=revision(),**base(case))


def test_client_cannot_inject_preapproved_signatures(case):
    who=actor(case,Role.ENGINEER)
    case=state(case,stage=Stage.REPORT_PROCESSING,substate=Substate.PENDING_REPORT)
    injected=revision().model_copy(update={'signatures':(signature(who.actor_id),)})
    with pytest.raises(InvalidTransitionError):
        apply(case,SubmitReport(action='submit_report_revision',revision=injected,executor_signature=signature(who.actor_id),**base(case)),who)


def test_report_return_records_level_and_prevents_later_cross_level(case):
    from app.schemas.requests import ReviewRecord
    ref=revision()
    case=state(case,stage=Stage.REPORT_REVIEW,substate=Substate.REPORT_LEVEL2,reports=(ref,))
    reviewer=actor(case,Role.LEVEL2)
    returned=apply(case,ReturnReport(action='return_report',content_revision_id=ref.content_revision_id,
        reason='synthetic correction',**base(case)),reviewer).state
    assert returned.reviews[-1].level==2
    assert returned.reviews[-1].decision=='return_report'
    assert returned.reviews[-1].signature is None
    # Later stage provided as trusted snapshot, keeping original return history.
    later=state(returned,stage=Stage.REPORT_REVIEW,substate=Substate.REPORT_LEVEL3)
    actor_as_level3=replace(reviewer,roles=frozenset({Role.LEVEL3}))
    with pytest.raises(AuthorizationError):
        apply(later,ApproveReport(action='approve_report',content_revision_id=ref.content_revision_id,
            signature=signature(reviewer.actor_id),**base(later)),actor_as_level3)


def test_historical_report_author_cannot_review_after_assignment_change(case):
    author=actor(case,Role.ENGINEER)
    ref=revision().model_copy(update={'signatures':(signature(author.actor_id),)})
    changed_assignment=state(case,stage=Stage.REPORT_REVIEW,substate=Substate.REPORT_LEVEL2,
        assignee_ids=frozenset({uuid4()}),reports=(ref,))
    author_as_reviewer=replace(author,roles=frozenset({Role.LEVEL2}))
    with pytest.raises(AuthorizationError):
        apply(changed_assignment,ApproveReport(action='approve_report',content_revision_id=ref.content_revision_id,
            signature=signature(author.actor_id),**base(changed_assignment)),author_as_reviewer)
