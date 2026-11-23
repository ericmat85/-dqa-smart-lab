"""Pure proposal transitions only; no persistence, clock, authentication or side effects."""
from datetime import datetime
from hashlib import sha256
from uuid import UUID
from typing import Literal
from app.authz.interfaces import ActorContext, CaseScope, PermissionEvaluator, PermissionDecision
from app.core.errors import (AuthorizationError, RuleNotApprovedError, VersionConflictError,
                            InvalidTransitionError, IdempotencyConflictError)
from app.domain.events import DomainEvent
from app.domain.permissions import Permission, Role
from app.domain.states import Stage, Substate
from app.schemas.common import StrictModel
from app.schemas.requests import CaseState, ReviewRecord
from app.schemas.commands import (BaseCommand, PendingRule, ResubmitRequest, ApproveRequest,
    ReturnRequest, MarkElapsed, ConfirmComplete, ReturnReport, SubmitReport, ApproveReport, ForceInterrupt)


class WorkflowTransition(StrictModel):
    state: CaseState
    event: DomainEvent
    semantics: Literal["PURE_LOGIC_ONLY_NOT_A_COMMITTED_BUSINESS_OPERATION"] = "PURE_LOGIC_ONLY_NOT_A_COMMITTED_BUSINESS_OPERATION"
    side_effects_authorized: Literal[False] = False


class IdempotencyRecord(StrictModel):
    tenant_id: UUID
    actor_id: UUID
    request_id: UUID
    key: str
    payload_sha256: str
    result: WorkflowTransition


def scope_for(case):
    return CaseScope(case.tenant_id, case.request_id, case.requester_id, case.supervisor_id, case.assignee_ids)


def authorize(case, actor, evaluator, permission):
    if (not isinstance(actor, ActorContext) or not isinstance(permission, Permission)
            or actor.membership_active is not True or actor.tenant_id != case.tenant_id
            or case.request_id not in actor.case_ids):
        raise AuthorizationError()
    if actor.actor_id not in {case.requester_id, case.supervisor_id, *case.assignee_ids} and not (
            actor.roles & {Role.LEVEL1, Role.LEVEL2, Role.LEVEL3}):
        raise AuthorizationError()
    decision = evaluator.evaluate(actor, scope_for(case), permission)
    if not isinstance(decision, PermissionDecision) or decision.allowed is not True:
        raise AuthorizationError()


def require_role(actor, role):
    if role not in actor.roles:
        raise AuthorizationError()


def reviewer(case, actor, level):
    require_role(actor, {1: Role.LEVEL1, 2: Role.LEVEL2, 3: Role.LEVEL3}[level])
    report_authors = {s.signer_id for report in case.reports for s in report.signatures}
    prior_supervisors = {r.actor_id for r in case.reviews if r.level == 0}
    if actor.actor_id in {case.requester_id, case.supervisor_id, *case.assignee_ids, *report_authors, *prior_supervisors}:
        raise AuthorizationError()
    if any(r.actor_id == actor.actor_id and r.level in (1, 2, 3) and r.level != level for r in case.reviews):
        raise AuthorizationError()


def fresh_signature(case, actor, signature):
    if signature.signer_id != actor.actor_id:
        raise AuthorizationError()
    used = [s.artifact_id for r in case.reports for s in r.signatures]
    used += [r.signature.artifact_id for r in case.reviews if r.signature]
    if signature.artifact_id in used:
        raise InvalidTransitionError()


def ensure_state(condition):
    if not condition:
        raise InvalidTransitionError()


def transition(case: CaseState, command: BaseCommand, actor: ActorContext | None,
               evaluator: PermissionEvaluator, *, event_id: UUID, now: datetime,
               prior: IdempotencyRecord | None = None) -> WorkflowTransition:
    if isinstance(command, PendingRule):
        raise RuleNotApprovedError()
    permissions = {ResubmitRequest: Permission.RESUBMIT, ApproveRequest: Permission.REVIEW_REQUEST,
        ReturnRequest: Permission.REVIEW_REQUEST, MarkElapsed: Permission.COMPLETE,
        ConfirmComplete: Permission.COMPLETE, ReturnReport: Permission.REPORT_RETURN,
        SubmitReport: Permission.REPORT_SUBMIT, ApproveReport: Permission.REPORT_REVIEW,
        ForceInterrupt: Permission.FORCE_INTERRUPT}
    permission = permissions.get(type(command))
    if permission is None:
        raise RuleNotApprovedError()
    authorize(case, actor, evaluator, permission)
    payload_hash = sha256(command.model_dump_json().encode()).hexdigest()
    if prior is not None:
        if (prior.tenant_id, prior.actor_id, prior.request_id, prior.key) != (
                case.tenant_id, actor.actor_id, case.request_id, command.idempotency_key):
            raise IdempotencyConflictError()
        if (prior.payload_sha256 != payload_hash
                or prior.result.state.request_id != case.request_id
                or prior.result.state.tenant_id != case.tenant_id
                or prior.result.event.actor_id != actor.actor_id
                or prior.result.event.action != command.action
                or prior.result.state.version != command.expected_version + 1):
            raise IdempotencyConflictError()
        return prior.result  # Requires trusted repository record, never request-body input.
    if case.version != command.expected_version:
        raise VersionConflictError()
    if now.utcoffset() is None or any(e.event_id == event_id for e in case.events):
        raise InvalidTransitionError()
    changes = {}
    records = case.reviews
    if isinstance(command, ResubmitRequest):
        ensure_state(case.substate == Substate.RETURNED and case.stage in (Stage.SIGNOFF, Stage.REVIEW))
        require_role(actor, Role.REQUESTER)
        if actor.actor_id != case.requester_id:
            raise AuthorizationError()
        changes = dict(stage=Stage.SIGNOFF, substate=Substate.PENDING_SIGNOFF, round_number=case.round_number+1)
    elif isinstance(command, (ApproveRequest, ReturnRequest)):
        if case.stage == Stage.SIGNOFF:
            ensure_state(isinstance(command, ApproveRequest) and case.substate == Substate.PENDING_SIGNOFF)
            require_role(actor, Role.REQUEST_MANAGER)
            if actor.actor_id != case.supervisor_id or actor.actor_id == case.requester_id:
                raise AuthorizationError()
            level = 0
            changes = dict(stage=Stage.REVIEW, substate=Substate.REQUEST_LEVEL1)
        else:
            ensure_state(case.stage == Stage.REVIEW and case.substate in (Substate.REQUEST_LEVEL1, Substate.REQUEST_LEVEL2))
            level = 1 if case.substate == Substate.REQUEST_LEVEL1 else 2
            reviewer(case, actor, level)
            changes = dict(stage=Stage.REVIEW if level==1 else Stage.SCHEDULING,
                           substate=Substate.REQUEST_LEVEL2 if level==1 else Substate.UNSCHEDULED)
        if isinstance(command, ReturnRequest):
            changes = dict(substate=Substate.RETURNED)
        else:
            fresh_signature(case, actor, command.signature)
        records += (ReviewRecord(actor_id=actor.actor_id, level=level, round_number=case.round_number,
            decision="return" if isinstance(command, ReturnRequest) else "approve",
            signature=getattr(command,"signature",None)),)
    elif isinstance(command, (MarkElapsed, ConfirmComplete)):
        require_role(actor, Role.ENGINEER)
        if actor.actor_id not in case.assignee_ids:
            raise AuthorizationError()
        ensure_state(case.stage == Stage.RUNNING and case.substate in (Substate.RUNNING, Substate.AWAITING_COMPLETION))
        ensure_state(case.planned_end is not None and now >= case.planned_end)
        if isinstance(command, MarkElapsed):
            changes = dict(substate=Substate.AWAITING_COMPLETION)
        else:
            ensure_state(case.substate == Substate.AWAITING_COMPLETION)
            changes = dict(stage=Stage.REPORT_PROCESSING, substate=Substate.PENDING_REPORT)
    elif isinstance(command, ReturnReport):
        ensure_state(bool(case.reports) and case.reports[-1].content_revision_id == command.content_revision_id)
        if case.stage == Stage.REPORT_VIEW:
            level = 0  # Designated supervisor, not a numbered report-review level.
            require_role(actor, Role.REQUEST_MANAGER)
            if actor.actor_id != case.supervisor_id or actor.actor_id == case.requester_id:
                raise AuthorizationError()
        else:
            ensure_state(case.stage == Stage.REPORT_REVIEW and case.substate in (Substate.REPORT_LEVEL2,Substate.REPORT_LEVEL3))
            level = 2 if case.substate == Substate.REPORT_LEVEL2 else 3
            reviewer(case, actor, level)
        records += (ReviewRecord(actor_id=actor.actor_id, level=level, round_number=case.round_number,
            decision="return_report", content_revision_id=command.content_revision_id),)
        changes = dict(stage=Stage.REPORT_PROCESSING, substate=Substate.RETURNED)
    elif isinstance(command, SubmitReport):
        ensure_state(case.stage==Stage.REPORT_PROCESSING and case.substate in (Substate.PENDING_REPORT,Substate.RETURNED))
        require_role(actor, Role.ENGINEER)
        if actor.actor_id not in case.assignee_ids:
            raise AuthorizationError()
        revision = command.revision
        ensure_state(revision.revision_number == len(case.reports)+1)
        ensure_state(revision.content_revision_id not in {r.content_revision_id for r in case.reports})
        ensure_state(revision.original.artifact_id not in {r.original.artifact_id for r in case.reports})
        ensure_state(not revision.signatures and not revision.signed_artifacts) # Client cannot inject approvals.
        fresh_signature(case, actor, command.executor_signature)
        revision = revision.model_copy(update={"signatures":(command.executor_signature,)})
        changes = dict(stage=Stage.REPORT_REVIEW, substate=Substate.REPORT_LEVEL2, reports=case.reports+(revision,))
    elif isinstance(command, ApproveReport):
        ensure_state(case.stage==Stage.REPORT_REVIEW and case.substate in (Substate.REPORT_LEVEL2,Substate.REPORT_LEVEL3))
        ensure_state(bool(case.reports) and case.reports[-1].content_revision_id==command.content_revision_id)
        level=2 if case.substate==Substate.REPORT_LEVEL2 else 3
        reviewer(case, actor, level)
        fresh_signature(case, actor, command.signature)
        records += (ReviewRecord(actor_id=actor.actor_id,level=level,round_number=case.round_number,
            decision="approve_report",content_revision_id=command.content_revision_id,signature=command.signature),)
        changes = dict(stage=Stage.REPORT_REVIEW if level==2 else Stage.REPORT_VIEW,
                       substate=Substate.REPORT_LEVEL3 if level==2 else Substate.REPORT_VIEW)
    elif isinstance(command, ForceInterrupt):
        require_role(actor, Role.LEVEL1)
        authorize(case, actor, evaluator, Permission.EDIT_SCHEDULE)
        ensure_state(case.stage==Stage.RUNNING and case.substate in (Substate.RUNNING,Substate.AWAITING_COMPLETION))
        ensure_state(command.reservation_id in case.reservation_ids and command.reservation_id not in case.cancelled_reservation_ids)
        changes=dict(substate=Substate.INTERRUPTED,
                     cancelled_reservation_ids=case.cancelled_reservation_ids+(command.reservation_id,))
    event=DomainEvent(event_id=event_id,request_id=case.request_id,tenant_id=case.tenant_id,
        actor_id=actor.actor_id,action=command.action,version=case.version+1,recorded_at=now,
        reason=getattr(command,"reason",None),reservation_id=getattr(command,"reservation_id",None),
        content_revision_id=getattr(command,"content_revision_id",None))
    # Revalidate instead of bypassing validation with model_copy for aggregate state.
    new_state=CaseState.model_validate({**case.model_dump(),**changes,"reviews":records,
        "version":case.version+1,"events":case.events+(event,)})
    return WorkflowTransition(state=new_state,event=event)


def require_committable_business_operation(result: WorkflowTransition):
    # No real API may commit this offline pure result; all external side effects unapproved.
    raise RuleNotApprovedError()
