from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from hashlib import sha256
from threading import Barrier
from uuid import uuid4
import pytest
from app.authz.adapters.context import AuthorizationSnapshot, CaseAuthorization
from app.core.errors import (AuthorizationError, VersionConflictError, IdempotencyConflictError,
                             InvalidTransitionError, RuleNotApprovedError)
from app.domain.permissions import Permission, Role
from app.domain.states import Stage, Substate
from app.domain.workflow import scope_for, require_committable_business_operation
from app.schemas.commands import ResubmitRequest, ReturnRequest, ApproveRequest, ReturnReport, PendingRule, SubmitReport
from app.schemas.common import ArtifactHashRef, SignatureRef
from app.schemas.reports import ReportRevisionRef
from app.schemas.requests import ReviewRecord
from conftest import actor, state, NOW
from .fakes import MemoryStore, MemoryUnitOfWork, references


class Clock:
    value = NOW.timestamp()

    def now(self):
        return self.value


def trusted(store, case, role=Role.REQUESTER, actor_id=None, level=None):
    who = actor(case, role, actor_id)
    store.members[(case.tenant_id, who.actor_id)] = 'synthetic-epoch-1'
    ca = CaseAuthorization(scope_for(case), frozenset({who.actor_id}),
        frozenset(s.signer_id for r in case.reports for s in r.signatures),
        tuple((r.actor_id, r.level) for r in case.reviews),
        frozenset((role, p, level) for p in Permission), str(case.version))
    return AuthorizationSnapshot(who, ca, 'synthetic-epoch-1', NOW.timestamp()+60,
                                 NOW.timestamp()+300, uuid4())


def register(store, case, *refs):
    store.data['references'].update((case.tenant_id, case.request_id, r.artifact_id, r.sha256) for r in refs)


def command(case, key='same-key'):
    return ResubmitRequest(action='resubmit_request', expected_version=case.version, idempotency_key=key)


def prepare(u, cmd):
    return u.prepare(cmd, event_id=uuid4(), now=NOW)


def current(store, case):
    return store.snapshot()['cases'][(case.tenant_id, case.request_id)]


def test_atomic_case_event_audit_idempotency_and_no_implicit_commit(case):
    store = MemoryStore([case]); before = store.snapshot(); snap = trusted(store, case)
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        result = prepare(u, command(case))
        assert store.snapshot() == before
        u.publish_synthetic_for_test()
    data = store.snapshot()
    assert current(store, case) == result.state
    assert list(data['events'].values()) == [result.event]
    assert next(iter(data['audits'].values())).event == result.event
    assert len(data['idempotency']) == 1
    assert result.side_effects_authorized is False


@pytest.mark.parametrize('point', range(6))
def test_failure_at_each_staging_step_rolls_back_everything(case, point):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(RuntimeError, match='SYNTHETIC_INJECTED_FAILURE'):
            u.prepare(command(case), event_id=uuid4(), now=NOW, fail_after=point)
        with pytest.raises(InvalidTransitionError):
            u.publish_synthetic_for_test()
    assert store.snapshot() == before


def test_exit_without_publish_and_exception_roll_back(case):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        prepare(u, command(case))
    assert store.snapshot() == before
    with pytest.raises(RuntimeError):
        with MemoryUnitOfWork(store, snap, Clock()) as u:
            prepare(u, command(case))
            raise RuntimeError('synthetic')
    assert store.snapshot() == before


def test_repeat_request_returns_original_without_duplicate_event(case):
    store = MemoryStore([case]); snap = trusted(store, case)
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        result = prepare(u, command(case)); u.publish_synthetic_for_test()
    before = store.snapshot(); snap = trusted(store, current(store, case))
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        assert prepare(u, command(case)) == result
        u.publish_synthetic_for_test()
    assert store.snapshot() == before


def test_same_key_changed_payload_rejected(case):
    store = MemoryStore([case]); snap = trusted(store, case)
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        prepare(u, command(case)); u.publish_synthetic_for_test()
    before = store.snapshot(); snap = trusted(store, current(store, case))
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(IdempotencyConflictError):
            prepare(u, command(current(store, case)))
    assert store.snapshot() == before


def test_same_actor_case_key_different_actions_are_isolated(case):
    case = state(case, substate=Substate.REQUEST_LEVEL1)
    store = MemoryStore([case]); snap = trusted(store, case, Role.LEVEL1, level=1)
    sig = SignatureRef(artifact_id=uuid4(), sha256=sha256(b'synthetic-signature').hexdigest(), signer_id=snap.actor.actor_id)
    register(store, case, sig)
    with MemoryUnitOfWork(store, snap, Clock(), review_level=1) as u:
        prepare(u, ReturnRequest(action='return_request', reason='synthetic', expected_version=1, idempotency_key='shared'))
        u.publish_synthetic_for_test()
    # Trusted next round at same level; retain every old decision/event.
    later = state(current(store, case), substate=Substate.REQUEST_LEVEL1, round_number=2, version=3)
    with store.lock:
        store.data['cases'][(case.tenant_id, case.request_id)] = later
    snap = trusted(store, later, Role.LEVEL1, snap.actor.actor_id, level=1)
    with MemoryUnitOfWork(store, snap, Clock(), review_level=1) as u:
        result = prepare(u, ApproveRequest(action='approve_request', signature=sig, expected_version=3, idempotency_key='shared'))
        assert result.state.substate == Substate.REQUEST_LEVEL2
        assert u.repository.get_idempotency(case.tenant_id, snap.actor.actor_id, case.request_id, 'shared', action='return_request') is not None
        u.publish_synthetic_for_test()
    assert {k[3] for k in store.data['idempotency']} == {'return_request', 'approve_request'}
    assert len(current(store, case).reviews) == 2


@pytest.mark.parametrize('dimension', ['tenant', 'actor', 'case', 'action', 'key'])
def test_five_part_idempotency_scope_is_explicit(case, dimension):
    from app.ports.transaction_contract import idempotency_scope
    store = MemoryStore([case]); snap = trusted(store, case)
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        prepare(u, command(case)); record = next(iter(u.local['idempotency'].values()))
        original = idempotency_scope(record)
        if dimension == 'action':
            event = record.result.event.model_copy(update={'action':'different'})
            changed = record.model_copy(update={'result':record.result.model_copy(update={'event':event})})
        else:
            field = {'tenant':'tenant_id', 'actor':'actor_id', 'case':'request_id', 'key':'key'}[dimension]
            changed = record.model_copy(update={field:'other' if field=='key' else uuid4()})
        assert idempotency_scope(changed) != original


@pytest.mark.parametrize('dimension', ['tenant', 'actor', 'case'])
def test_repository_cross_scope_access_denied(case, dimension):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    args = [case.tenant_id, snap.actor.actor_id, case.request_id]
    args[['tenant','actor','case'].index(dimension)] = uuid4()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(AuthorizationError):
            u.repository.get_idempotency(*args, 'same-key', action='resubmit_request')
    assert store.snapshot() == before


@pytest.mark.parametrize('duplicate', [False, True])
def test_two_concurrent_versions_only_one_wins(case, duplicate):
    store = MemoryStore([case]); snap = trusted(store, case); barrier = Barrier(2)
    def attempt(key):
        try:
            with MemoryUnitOfWork(store, snap, Clock()) as u:
                prepare(u, command(case, key)); barrier.wait(timeout=10)
                u.publish_synthetic_for_test()
            return 'published'
        except VersionConflictError:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, ['first','first' if duplicate else 'second']))
    assert sorted(outcomes) == ['conflict', 'published']
    assert current(store, case).version == 2
    assert len(store.data['events']) == len(store.data['audits']) == len(store.data['idempotency']) == 1
    if duplicate:
        before = store.snapshot(); fresh = trusted(store,current(store,case))
        with MemoryUnitOfWork(store,fresh,Clock()) as u:
            prepare(u,command(case,'first'));u.publish_synthetic_for_test()
        assert store.snapshot() == before


def test_unrelated_cases_do_not_lose_each_others_updates(case):
    other = state(case, request_id=uuid4()); store = MemoryStore([case, other])
    a = trusted(store, case); b = trusted(store, other)
    with MemoryUnitOfWork(store, a, Clock()) as u, MemoryUnitOfWork(store, b, Clock()) as v:
        prepare(u, command(case)); prepare(v, command(other))
        u.publish_synthetic_for_test(); v.publish_synthetic_for_test()
    assert current(store, case).version == current(store, other).version == 2
    assert len(store.data['events']) == 2


@pytest.mark.parametrize('when', ['before_prepare', 'before_publish', 'before_replay'])
def test_revoked_membership_cannot_write_or_replay(case, when):
    store = MemoryStore([case]); snap = trusted(store, case)
    if when == 'before_replay':
        with MemoryUnitOfWork(store, snap, Clock()) as u:
            prepare(u, command(case)); u.publish_synthetic_for_test()
        snap = trusted(store, current(store, case))
    before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        if when == 'before_publish':
            prepare(u, command(case)); store.revoke(snap.actor)
            with pytest.raises(AuthorizationError):u.publish_synthetic_for_test()
        else:
            store.revoke(snap.actor)
            with pytest.raises(AuthorizationError):prepare(u, command(case))
    assert store.snapshot() == before


def test_expiry_between_prepare_and_publish_fails_closed(case):
    store = MemoryStore([case]); snap = trusted(store, case); clock = Clock(); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, clock) as u:
        prepare(u, command(case)); clock.value += 61
        with pytest.raises(AuthorizationError):u.publish_synthetic_for_test()
    assert store.snapshot() == before


@pytest.mark.parametrize('corruption', ['events','audits','reviews','idempotency','cases','references'])
def test_missing_or_tampered_bundle_never_partially_publishes(case, corruption):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        prepare(u, command(case)); u.local[corruption].clear()
        if corruption == 'references':u.local['references'].add(('forged',))
        with pytest.raises(InvalidTransitionError):u.publish_synthetic_for_test()
    assert store.snapshot() == before


def test_duplicate_event_id_across_cases_is_rejected(case):
    other = state(case, request_id=uuid4()); store = MemoryStore([case, other]); a = trusted(store, case); b = trusted(store, other)
    event = uuid4()
    with MemoryUnitOfWork(store, a, Clock()) as u:
        u.prepare(command(case), event_id=event, now=NOW); u.publish_synthetic_for_test()
    before = store.snapshot()
    with MemoryUnitOfWork(store, b, Clock()) as u:
        with pytest.raises(InvalidTransitionError):u.prepare(command(other), event_id=event, now=NOW)
    assert store.snapshot() == before


@pytest.mark.parametrize('mode', ['self','cross_level','admin','missing_mapping','forged_context'])
def test_authorization_failures_preserve_every_table(case, mode):
    case = state(case, substate=Substate.REQUEST_LEVEL1)
    who_id = case.requester_id if mode == 'self' else uuid4()
    if mode == 'cross_level':
        case = state(case, reviews=(ReviewRecord(actor_id=who_id,level=2,round_number=1,decision='approve'),))
    store = MemoryStore([case]); snap = trusted(store, case, Role.ADMIN if mode=='admin' else Role.LEVEL1, who_id, level=1)
    if mode == 'missing_mapping':snap = replace(snap, case=replace(snap.case, grants=frozenset()))
    if mode == 'forged_context':snap = replace(snap, actor=replace(snap.actor, tenant_id=uuid4()))
    sig = SignatureRef(artifact_id=uuid4(),sha256='a'*64,signer_id=who_id); register(store, case, sig); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock(), review_level=1) as u:
        with pytest.raises(AuthorizationError):prepare(u, ApproveRequest(action='approve_request',signature=sig,expected_version=1,idempotency_key='synthetic'))
    assert store.snapshot() == before


@pytest.mark.parametrize('reference_state', ['missing','wrong_tenant','wrong_case','wrong_digest','missing_revision','valid'])
def test_report_references_and_revision_commit_atomically(case, reference_state):
    case = state(case, stage=Stage.REPORT_PROCESSING, substate=Substate.PENDING_REPORT)
    store = MemoryStore([case]); snap = trusted(store, case, Role.ENGINEER)
    original = ArtifactHashRef(artifact_id=uuid4(),sha256=sha256(b'synthetic-report').hexdigest())
    sig = SignatureRef(artifact_id=uuid4(),sha256=sha256(b'synthetic-signature').hexdigest(),signer_id=snap.actor.actor_id)
    rev = ReportRevisionRef(content_revision_id=uuid4(),revision_number=1,original=original)
    register(store, case, sig)
    row = (case.tenant_id,case.request_id,original.artifact_id,original.sha256)
    if reference_state != 'missing':
        row = list(row)
        if reference_state == 'wrong_tenant':row[0] = uuid4()
        if reference_state == 'wrong_case':row[1] = uuid4()
        if reference_state == 'wrong_digest':row[3] = 'f'*64
        store.data['references'].add(tuple(row))
    before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        prepare(u, SubmitReport(action='submit_report_revision',revision=rev,executor_signature=sig,expected_version=1,idempotency_key='report'))
        if reference_state == 'missing_revision':u.local['revisions'].clear()
        if reference_state == 'valid':u.publish_synthetic_for_test()
        else:
            with pytest.raises(InvalidTransitionError):u.publish_synthetic_for_test()
    if reference_state != 'valid':assert store.snapshot() == before
    else:
        assert len(store.data['revisions']) == len(store.data['events']) == len(store.data['audits']) == 1
        assert references(current(store, case)) == {(original.artifact_id,original.sha256),(sig.artifact_id,sig.sha256)}


@pytest.mark.parametrize('action', PendingRule.model_fields['action'].annotation.__args__)
def test_pending_policy_never_publishes(case, action):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(RuleNotApprovedError):prepare(u, PendingRule(action=action,expected_version=1,idempotency_key='pending'))
    assert store.snapshot() == before


def test_business_commit_and_artifact_bytes_remain_blocked(case):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        result = prepare(u, command(case))
        with pytest.raises(RuleNotApprovedError):require_committable_business_operation(result)
        with pytest.raises(RuleNotApprovedError):u.artifacts.put_new_bytes(None,b'synthetic')
        with pytest.raises(RuleNotApprovedError):u.artifacts.get_bytes(None)
        with pytest.raises(RuleNotApprovedError):u.commit()
    assert store.snapshot() == before


@pytest.mark.parametrize('point', range(6))
def test_report_failure_rolls_back_revision_signature_refs_and_audit(case, point):
    case = state(case, stage=Stage.REPORT_PROCESSING, substate=Substate.PENDING_REPORT)
    store = MemoryStore([case]); snap = trusted(store, case, Role.ENGINEER)
    original = ArtifactHashRef(artifact_id=uuid4(), sha256='b'*64)
    sig = SignatureRef(artifact_id=uuid4(), sha256='a'*64, signer_id=snap.actor.actor_id)
    rev = ReportRevisionRef(content_revision_id=uuid4(), revision_number=1, original=original)
    register(store, case, original, sig); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(RuntimeError, match='SYNTHETIC_INJECTED_FAILURE'):
            u.prepare(SubmitReport(action='submit_report_revision',revision=rev,executor_signature=sig,
                expected_version=1,idempotency_key='report'),event_id=uuid4(),now=NOW,fail_after=point)
    assert store.snapshot() == before


def test_stale_expected_version_and_untyped_cas_rejected(case):
    store = MemoryStore([case]); snap = trusted(store, case); before = store.snapshot()
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(VersionConflictError):prepare(u, command(case).model_copy(update={'expected_version':2}))
    with MemoryUnitOfWork(store, snap, Clock()) as u:
        with pytest.raises(VersionConflictError):u.repository.compare_and_swap(state(case,version=2),True)
    assert store.snapshot() == before


def test_report_return_preserves_original_revision_and_signatures(case):
    original = ArtifactHashRef(artifact_id=uuid4(), sha256='b'*64)
    sig = SignatureRef(artifact_id=uuid4(),sha256='a'*64,signer_id=next(iter(case.assignee_ids)))
    rev = ReportRevisionRef(content_revision_id=uuid4(),revision_number=1,original=original,signatures=(sig,))
    case = state(case,stage=Stage.REPORT_VIEW,substate=Substate.REPORT_VIEW,reports=(rev,))
    store = MemoryStore([case]); snap = trusted(store,case,Role.REQUEST_MANAGER,level=0)
    register(store,case,original,sig)
    with MemoryUnitOfWork(store,snap,Clock(),review_level=0) as u:
        prepare(u,ReturnReport(action='return_report',reason='synthetic correction',content_revision_id=rev.content_revision_id,
            expected_version=1,idempotency_key='return'))
        u.publish_synthetic_for_test()
    saved = current(store,case)
    assert saved.reports == (rev,)
    assert saved.reviews[-1].signature is None
    assert saved.stage == Stage.REPORT_PROCESSING
    assert store.data['revisions'][(case.tenant_id,case.request_id,rev.content_revision_id)] == rev


def test_missing_case_fails_closed(case):
    store = MemoryStore([case]); snap = trusted(store,case); store.data['cases'].clear(); before=store.snapshot()
    with MemoryUnitOfWork(store,snap,Clock()) as u:
        with pytest.raises(AuthorizationError):prepare(u,command(case))
    assert store.snapshot() == before


def test_changed_membership_epoch_after_prepare_denies(case):
    store=MemoryStore([case]);snap=trusted(store,case);before=store.snapshot()
    with MemoryUnitOfWork(store,snap,Clock()) as u:
        prepare(u,command(case))
        store.members[(case.tenant_id,snap.actor.actor_id)]='changed-epoch'
        with pytest.raises(AuthorizationError):u.publish_synthetic_for_test()
    assert store.snapshot()==before


def test_ai_proposal_is_not_a_business_command(case):
    from types import SimpleNamespace
    store=MemoryStore([case]);snap=trusted(store,case);before=store.snapshot()
    proposal=SimpleNamespace(action='approve_request',idempotency_key='AI-says-approved',approved=True)
    with MemoryUnitOfWork(store,snap,Clock()) as u:
        with pytest.raises(RuleNotApprovedError):prepare(u,proposal)
    assert store.snapshot()==before


def test_explicit_optimized_commit_gate_without_assertions():
    import os
    from pathlib import Path
    import subprocess
    import sys
    script = '''
import socket
def blocked(*a, **k): raise RuntimeError('external I/O forbidden')
socket.socket.connect=socket.socket.connect_ex=blocked
socket.create_connection=socket.getaddrinfo=blocked
from uuid import uuid4
from datetime import datetime, timezone
from app.domain.states import Stage,Substate
from app.schemas.requests import CaseState
from app.authz.interfaces import ActorContext,CaseScope
from app.authz.adapters.context import AuthorizationSnapshot,CaseAuthorization
from app.domain.permissions import Role,Permission
from app.schemas.commands import ResubmitRequest,PendingRule
from app.core.errors import RuleNotApprovedError,AuthorizationError
from repository_contract.fakes import MemoryStore,MemoryUnitOfWork
c=CaseState(request_id=uuid4(),tenant_id=uuid4(),requester_id=uuid4(),supervisor_id=uuid4(),assignee_ids=frozenset(),stage=Stage.REVIEW,substate=Substate.RETURNED,version=1)
a=ActorContext(c.requester_id,c.tenant_id,True,frozenset({Role.REQUESTER}),frozenset({c.request_id}))
ca=CaseAuthorization(CaseScope(c.tenant_id,c.request_id,c.requester_id,c.supervisor_id,c.assignee_ids),frozenset({a.actor_id}),frozenset(),(),frozenset({(Role.REQUESTER,Permission.RESUBMIT,None)}),'1')
s=AuthorizationSnapshot(a,ca,'v1',100,100,uuid4())
class Clock:
 def now(self):return 1
store=MemoryStore([c]);store.members[(c.tenant_id,a.actor_id)]='v1'
before=store.snapshot()
with MemoryUnitOfWork(store,s,Clock()) as u:
 u.prepare(ResubmitRequest(action='resubmit_request',expected_version=1,idempotency_key='test'),event_id=uuid4(),now=datetime.now(timezone.utc))
 try:u.commit()
 except RuleNotApprovedError:pass
 else:raise SystemExit('business commit gate bypassed')
if store.snapshot()!=before:raise SystemExit('partial publication')
with MemoryUnitOfWork(store,s,Clock()) as u:
 try:u.prepare(PendingRule(action='release_equipment',expected_version=1,idempotency_key='test'),event_id=uuid4(),now=datetime.now(timezone.utc))
 except RuleNotApprovedError:pass
 else:raise SystemExit('pending rule bypassed')
store.revoke(a)
with MemoryUnitOfWork(store,s,Clock()) as u:
 try:u.prepare(ResubmitRequest(action='resubmit_request',expected_version=1,idempotency_key='test'),event_id=uuid4(),now=datetime.now(timezone.utc))
 except AuthorizationError:pass
 else:raise SystemExit('revocation bypassed')
'''
    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':'.:tests'}
    result=subprocess.run([sys.executable,'-O','-c',script],cwd=Path(__file__).parents[2],env=env,text=True,capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
