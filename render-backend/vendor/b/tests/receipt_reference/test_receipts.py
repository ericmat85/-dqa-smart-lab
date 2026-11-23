from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from hashlib import sha256
from pathlib import Path
from threading import Barrier
from uuid import uuid4
import os
import subprocess
import sys
import pytest
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.core.errors import (AuthorizationError, DomainError, IdempotencyConflictError,
                            RuleNotApprovedError, VersionConflictError)
from app.core.receipt_dependencies import ReceiptDependencies, ReceiptDependencyUnavailable
from app.domain.permissions import Permission, Role
from app.domain.states import Stage, Substate
from app.schemas.artifacts import ArtifactIntegrityError, ArtifactUnavailableError, describe_server_bytes, hash_reference
from app.schemas.commands import SubmitReport
from app.schemas.common import SignatureRef
from app.schemas.reports import ReportRevisionRef
from app.schemas.storage_receipts import StoragePhase, validate_receipt_binding
from app.main import create_app
from conftest import state
from repository_contract.fakes import MemoryStore
from repository_contract.test_contract import Clock, trusted
from .fakes import SyntheticAuthority, SyntheticObjects, SyntheticReferencePublisher


@pytest.fixture
def env(case):
    case = state(case, stage=Stage.REPORT_PROCESSING, substate=Substate.PENDING_REPORT)
    store = MemoryStore([case]); clock = Clock(); clock.value = Clock.value
    snap = trusted(store, case, Role.ENGINEER)
    authz = SyntheticAuthority(store, clock); authz.admit_fixture_snapshot(snap)
    objects = SyntheticObjects(store, clock, authz, receipt_ttl=300, grace_period=10)
    revision = uuid4(); objects.bind_revision_for_test(case, revision)
    return {'case':case, 'store':store, 'clock':clock, 'snap':snap, 'authz':authz,
            'objects':objects, 'revision':revision,
            'publisher':SyntheticReferencePublisher(objects, authz, clock)}


def refresh(e, role=Role.ENGINEER):
    case = e['store'].data['cases'][(e['case'].tenant_id,e['case'].request_id)]
    snapshot = trusted(e['store'], case, role)
    snapshot = replace(snapshot, expires_at=e['clock'].now()+60, identity_expires_at=e['clock'].now()+300)
    e['authz'].admit_fixture_snapshot(snapshot)
    e['snap'] = snapshot
    return snapshot


def make(e, content=b'SYNTHETIC_EXCEL', kind='original_excel', *, revision=None, sources=()):
    return describe_server_bytes(content, authorization=e['snap'],revision_id=revision or e['revision'],
        artifact_kind=kind, display_name='synthetic.dat', source_artifact_ids=sources)


def upload(e, d, data):
    e['objects'].put_new_bytes(d,data,authorization=e['snap'])
    return e['objects'].verify_private(d,authorization=e['snap'])


def bundle(e):
    original = make(e); e['objects'].bind_original_for_test(original)
    sig = make(e,b'SYNTHETIC_SIGNATURE','signature_image')
    receipts = (upload(e, original,b'SYNTHETIC_EXCEL'),upload(e,sig,b'SYNTHETIC_SIGNATURE'))
    cmd = SubmitReport(action='submit_report_revision',expected_version=e['case'].version,
        idempotency_key='synthetic-key',revision=ReportRevisionRef(content_revision_id=e['revision'],
        revision_number=len(e['case'].reports)+1,original=hash_reference(original)),executor_signature=SignatureRef(
            artifact_id=sig.artifact_id,sha256=sig.sha256,signer_id=sig.signer_id))
    return cmd,receipts


def publish(e, cmd, receipts, **kwargs):
    return e['publisher'].publish(cmd,receipts,authorization=e['snap'],**kwargs)


def unchanged(e, before):
    assert e['store'].snapshot() == before
    assert not any(r['published'] for r in e['objects']._objects.values())


def test_atomic_publication_reuses_original_event_audit_revision_and_idempotency(env):
    cmd, receipts = bundle(env); result = publish(env,cmd,receipts)
    data = env['store'].snapshot()
    assert len(data['events']) == len(data['audits']) == len(data['idempotency']) == 1
    assert len(data['revisions']) == 1 and len(data['references']) == 2
    assert data['cases'][(env['case'].tenant_id,env['case'].request_id)] == result.state
    assert result.side_effects_authorized is False
    assert result.state.reports[0].signatures == (cmd.executor_signature,)
    refresh(env)
    assert env['objects'].get_bytes(receipts[0].descriptor(),authorization=env['snap']) == b'SYNTHETIC_EXCEL'


@pytest.mark.parametrize('fault',['interrupted','response_lost'])
def test_upload_unknown_does_not_issue_receipt_publish_or_return_bytes(env,fault):
    d = make(env); env['objects'].bind_original_for_test(d)
    before = env['store'].snapshot()
    with pytest.raises(TimeoutError):
        env['objects'].put_new_bytes(d,b'SYNTHETIC_EXCEL',authorization=env['snap'],fault=fault)
    assert env['objects'].phases[d.artifact_id] == StoragePhase.QUARANTINED
    with pytest.raises(ArtifactUnavailableError):env['objects'].verify_private(d,authorization=env['snap'])
    with pytest.raises(ArtifactUnavailableError):env['objects'].get_bytes(d,authorization=env['snap'])
    unchanged(env,before)


@pytest.mark.parametrize('scenario',['same_id','same_key','foreign_key'])
def test_duplicate_id_and_key_never_overwrite(env,scenario):
    cmd, receipts = bundle(env); d = receipts[0].descriptor()
    before = deepcopy_objects(env)
    with pytest.raises(ArtifactIntegrityError):
        if scenario == 'same_id':env['objects'].put_new_bytes(d,b'SYNTHETIC_EXCEL',authorization=env['snap'])
        elif scenario == 'same_key':
            env['objects'].phases.pop(d.artifact_id)
            env['objects'].put_new_bytes(d,b'SYNTHETIC_EXCEL',authorization=env['snap'])
        else:env['objects'].put_new_bytes(make(env),b'SYNTHETIC_EXCEL',authorization=env['snap'],object_key=receipts[0].object_key)
    assert deepcopy_objects(env) == before


def deepcopy_objects(e):
    return e['objects'].inspect_for_test()


@pytest.mark.parametrize('field,value',[
    ('sha256','f'*64),('content_length',999),('content_length',True),
    ('storage_generation','fake'),('receipt_id',None),('verification_status','REFERENCE_PUBLISHED'),
    ('verification_time',float('nan')),('expires_at',0.0),('object_key','client/path'),
    ('verification_policy','client'),('tenant_id',None),('source_artifact_ids',(uuid4(),))])
def test_tampered_or_client_receipt_fails_closed(env,field,value):
    cmd, receipts = bundle(env); before = env['store'].snapshot()
    bad = receipts[0].model_copy(update={field:value})
    with pytest.raises((DomainError,ValueError,TypeError)):
        publish(env,cmd,(bad,receipts[1]))
    unchanged(env,before)


@pytest.mark.parametrize('scenario',['revoked','expired','unknown_receipt','generation_changed','bytes_changed','missing_bytes','source_unavailable'])
def test_provider_evidence_must_remain_authoritative(env,scenario):
    cmd,receipts = bundle(env); r=receipts[0]; o=env['objects']; before=env['store'].snapshot()
    if scenario=='revoked':o.revoked.add(r.receipt_id)
    elif scenario=='expired':env['clock'].value+=301;refresh(env)
    elif scenario=='unknown_receipt':o.receipts.pop(r.receipt_id)
    elif scenario=='generation_changed':o.generations[r.artifact_id]='other-generation'
    elif scenario=='bytes_changed':o._objects[r.artifact_id]['content']=b'TAMPERED'
    elif scenario=='missing_bytes':o._objects.pop(r.artifact_id)
    else:o.unknown.add(r.artifact_id)
    with pytest.raises(DomainError):publish(env,cmd,receipts)
    unchanged(env,before)


@pytest.mark.parametrize('dimension',['tenant_id','case_id','revision_id','artifact_kind'])
def test_cross_scope_and_wrong_kind_rejected(env,dimension):
    cmd,receipts=bundle(env);before=env['store'].snapshot()
    value='signature_image' if dimension=='artifact_kind' else uuid4()
    bad=receipts[0].model_copy(update={dimension:value})
    with pytest.raises(DomainError):publish(env,cmd,(bad,receipts[1]))
    unchanged(env,before)


def test_hash_only_reference_cannot_replace_receipt(env):
    cmd,receipts=bundle(env);before=env['store'].snapshot()
    with pytest.raises((DomainError,AttributeError)):publish(env,cmd,(cmd.revision.original,receipts[1]))
    unchanged(env,before)


def test_source_chain_rejects_another_original_in_same_revision(env):
    cmd,rs=bundle(env);other=make(env,b'OTHER_EXCEL')
    env['objects'].put_new_bytes(other,b'OTHER_EXCEL',authorization=env['snap'])
    with pytest.raises(ArtifactIntegrityError):env['objects'].verify_private(other,authorization=env['snap'])
    signed=make(env,b'SIGNED','signed_excel',sources=(other.artifact_id,rs[1].artifact_id))
    env['objects'].put_new_bytes(signed,b'SIGNED',authorization=env['snap'])
    with pytest.raises(ArtifactIntegrityError):env['objects'].verify_private(signed,authorization=env['snap'])
    unchanged(env,env['store'].snapshot())


@pytest.mark.parametrize('field',['case_id','revision_id','signer_id'])
def test_signature_binding_mismatch_has_no_partial_publication(env,field):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    bad=rs[1].model_copy(update={field:uuid4()})
    with pytest.raises(DomainError):publish(env,cmd,(rs[0],bad))
    unchanged(env,before)


@pytest.mark.parametrize('fault',['revoke','case_version','snapshot_expired'])
def test_recheck_at_publication_boundary(env,fault):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    def mutate():
        if fault=='revoke':env['store'].revoke(env['snap'].actor)
        elif fault=='case_version':
            c=env['case'];env['store'].data['cases'][(c.tenant_id,c.request_id)]=state(c,version=c.version+1)
        else:env['clock'].value+=61
    with pytest.raises(DomainError):publish(env,cmd,rs,before_commit=mutate)
    after=env['store'].snapshot()
    for table in ('events','audits','idempotency','revisions','references'):assert after[table]==before[table]
    assert not any(r['published'] for r in env['objects']._objects.values())


def test_two_publishers_compete_same_cas_only_one_event(env):
    cmd,rs=bundle(env);barrier=Barrier(2)
    def worker(key):
        barrier.wait()
        try:return publish(env,cmd.model_copy(update={'idempotency_key':key}),rs)
        except DomainError:return None
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(worker,['first','second']))
    assert sum(r is not None for r in results)==1
    assert len(env['store'].data['events'])==len(env['store'].data['idempotency'])==1


def test_same_key_retry_reauthorizes_and_returns_original_event(env):
    cmd,rs=bundle(env);first=publish(env,cmd,rs);before=env['store'].snapshot();refresh(env)
    assert publish(env,cmd,rs)==first
    assert env['store'].snapshot()==before
    env['store'].revoke(env['snap'].actor)
    with pytest.raises(AuthorizationError):publish(env,cmd,rs)
    assert env['store'].snapshot()==before


def test_same_key_different_payload_rejected(env):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env);before=env['store'].snapshot()
    with pytest.raises(IdempotencyConflictError):publish(env,cmd.model_copy(update={'expected_version':2}),rs)
    assert env['store'].snapshot()==before


def test_db_success_response_lost_reconciles_without_new_event(env):
    cmd,rs=bundle(env)
    with pytest.raises(TimeoutError):publish(env,cmd,rs,fault='response_lost')
    before=env['store'].snapshot();refresh(env)
    outcome=env['publisher'].reconcile(cmd,rs,authorization=env['snap'])
    assert outcome.status=='CONFIRMED' and outcome.event_id==next(iter(before['events']))
    assert publish(env,cmd,rs).event.event_id==outcome.event_id
    assert env['store'].snapshot()==before


def test_definite_db_failure_keeps_private_bytes_and_retry_possible(env):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    with pytest.raises(RuntimeError):publish(env,cmd,rs,fault='db_failure')
    unchanged(env,before)
    assert len(env['objects']._objects)==2
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='NOT_COMMITTED'
    publish(env,cmd,rs)
    assert len(env['store'].data['events'])==1


def test_unknown_outcome_never_republishes_or_becomes_cleanup_eligible(env):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    with pytest.raises(ReceiptDependencyUnavailable):publish(env,cmd,rs,fault='outcome_unknown')
    unchanged(env,before)
    env['clock'].value+=11
    assert env['objects'].inspect(rs[0],authorization=env['snap'])=='NO_DELETE'
    with pytest.raises(DomainError):publish(env,cmd,rs)
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='UNKNOWN'
    unchanged(env,before)


@pytest.mark.parametrize('available',[True,False])
def test_reconciliation_requires_fresh_authorization_even_when_unavailable(env,available):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env)
    env['objects'].outcomes_available=available
    env['store'].revoke(env['snap'].actor)
    with pytest.raises(AuthorizationError):env['publisher'].reconcile(cmd,rs,authorization=env['snap'])


def test_unavailable_outcome_query_blocks_cleanup(env):
    cmd,rs=bundle(env);env['objects'].outcomes_available=False;env['clock'].value+=11
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='UNKNOWN'
    assert env['objects'].inspect(rs[0],authorization=env['snap'])=='NO_DELETE'


def test_cleanup_grace_and_claim_blocks_later_publish_no_deletion(env):
    cmd,rs=bundle(env);o=env['objects'];before=env['store'].snapshot()
    assert o.inspect(rs[0],authorization=env['snap'])=='WAIT_GRACE'
    env['clock'].value+=11
    assert o.inspect(rs[0],authorization=env['snap'])=='ELIGIBLE_FOR_CLAIM_ONLY'
    claim=o.claim_cleanup_for_test(rs[0],authorization=env['snap'])
    assert claim[0]==rs[0].storage_generation
    with pytest.raises(DomainError):publish(env,cmd,rs)
    assert o.inspect(rs[0],authorization=env['snap'])=='CLEANUP_PENDING'
    unchanged(env,before);assert len(o._objects)==2


def test_published_old_revision_never_cleanup_eligible(env):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env);env['clock'].value+=11
    before=deepcopy_objects(env)
    for r in rs:
        assert env['objects'].inspect(r,authorization=env['snap'])=='NO_DELETE'
        with pytest.raises(ArtifactIntegrityError):env['objects'].claim_cleanup_for_test(r,authorization=env['snap'])
    assert deepcopy_objects(env)==before


def test_cleanup_and_publish_race_serializes_safely(env):
    cmd,rs=bundle(env);env['clock'].value+=11;barrier=Barrier(2)
    def pub():
        barrier.wait()
        try:publish(env,cmd,rs);return 'published'
        except DomainError:return 'denied'
    def cleanup():
        barrier.wait()
        try:env['objects'].claim_cleanup_for_test(rs[0],authorization=env['snap']);return 'claimed'
        except DomainError:return 'denied'
    with ThreadPoolExecutor(max_workers=2) as pool:
        a=pool.submit(pub);b=pool.submit(cleanup);results=[a.result(),b.result()]
    assert results in (['published','denied'],['denied','claimed'])
    assert len(env['objects']._objects)==2


def test_orphan_retry_cannot_inspect_other_tenant(env):
    cmd,rs=bundle(env);before=deepcopy_objects(env)
    foreign=rs[0].model_copy(update={'tenant_id':uuid4()})
    for _ in range(2):
        with pytest.raises(AuthorizationError):env['objects'].inspect(foreign,authorization=env['snap'])
    assert deepcopy_objects(env)==before


@pytest.mark.parametrize('fault',['revoke','bytes','generation','expired','foreign_snapshot'])
def test_read_requires_new_authorization_and_full_integrity(env,fault):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env);r=rs[0];o=env['objects']
    if fault=='revoke':env['store'].revoke(env['snap'].actor)
    elif fault=='bytes':o._objects[r.artifact_id]['content']=b'TAMPERED'
    elif fault=='generation':o.generations[r.artifact_id]='changed'
    elif fault=='expired':env['clock'].value+=301;refresh(env)
    else:env['snap']=replace(env['snap'],request_id=uuid4())
    with pytest.raises(DomainError):o.get_bytes(r.descriptor(),authorization=env['snap'])
    assert len(env['store'].data['events'])==1


@pytest.mark.parametrize('component,method',[
    ('receipts','attest'),('objects','verify_private'),('objects','put_new_bytes'),
    ('objects','get_bytes'),('objects','append_revision'),('references','publish'),
    ('authz','authorize'),('outcomes','reconcile'),('orphans','inspect')])
def test_di_defaults_unavailable(component,method):
    with pytest.raises(ReceiptDependencyUnavailable):getattr(getattr(ReceiptDependencies(),component),method)()


@pytest.mark.parametrize('role',[Role.ADMIN,'AI',None])
def test_admin_ai_and_untrusted_context_never_approve(env,role):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    if role==Role.ADMIN:refresh(env,Role.ADMIN)
    elif role=='AI':
        with pytest.raises(ValueError):replace(env['snap'].actor,roles=frozenset({'AI'}))
        env['snap']=replace(env['snap'],request_id=uuid4())
    else:env['snap']=None
    with pytest.raises(AuthorizationError):publish(env,cmd,rs)
    unchanged(env,before)


def test_no_fake_in_factory_or_business_gate(env):
    app=create_app()
    assert not hasattr(app.state,'receipt_provider')
    assert not any('tests' in type(v).__module__ for v in app.state._state.values())
    with pytest.raises(RuleNotApprovedError):env['publisher'].commit()
    for path in (Path(__file__).parents[2]/'app').rglob('*.py'):
        text=path.read_text()
        assert 'receipt_reference.fakes' not in text
        assert 'import supabase' not in text and 'import openai' not in text


def test_optimized_safety_checks_are_explicit():
    script='''
from app.core.receipt_dependencies import ReceiptDependencies, ReceiptDependencyUnavailable
from app.schemas.storage_receipts import validate_receipt_binding
from app.schemas.artifacts import ArtifactIntegrityError
from app.domain.workflow import require_committable_business_operation
from app.core.errors import RuleNotApprovedError
for call,error in [(lambda: ReceiptDependencies().references.publish(),ReceiptDependencyUnavailable),
                   (lambda: validate_receipt_binding(None,None,now=1),ArtifactIntegrityError),
                   (lambda: require_committable_business_operation(None),RuleNotApprovedError)]:
    try: call()
    except error: pass
    else: raise SystemExit('Security check disappeared')
'''
    result=subprocess.run([sys.executable,'-O','-c',script],capture_output=True,text=True,
        timeout=30,cwd=Path(__file__).parents[2],env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    assert result.returncode==0,result.stderr


@pytest.mark.parametrize('stage',range(6))
def test_each_original_uow_staging_failure_rolls_back_reference_bundle(env,stage):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    with pytest.raises(RuntimeError):publish(env,cmd,rs,fault=f'stage_{stage}')
    unchanged(env,before)
    assert all(env['objects'].phases[r.artifact_id]==StoragePhase.VERIFIED_PRIVATE for r in rs)


@pytest.mark.parametrize('table',['events','audits','revisions','references','idempotency'])
def test_incomplete_authoritative_commit_is_unknown_not_false_success(env,table):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env)
    env['store'].data[table].clear()
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='UNKNOWN'


def test_five_part_idempotency_action_isolation(env):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env)
    data=env['store'].data;key=next(iter(data['idempotency']))
    record=data['idempotency'].pop(key)
    data['idempotency'][(*key[:3],'different_action',key[4])]=record
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='UNKNOWN'


def test_signed_excel_pdf_receipts_bind_verified_source_generations(env):
    cmd,rs=bundle(env);o=env['objects']
    signed=make(env,b'SIGNED_EXCEL','signed_excel',sources=tuple(r.artifact_id for r in rs))
    signed_receipt=upload(env,signed,b'SIGNED_EXCEL')
    pdf=make(env,b'PDF_BYTES','report_pdf',sources=(signed.artifact_id,))
    pdf_receipt=upload(env,pdf,b'PDF_BYTES')
    assert o.attest(pdf_receipt,pdf,authorization=env['snap'])==pdf_receipt
    assert o.sources[pdf_receipt.receipt_id]==(signed_receipt,)
    o.generations[rs[1].artifact_id]='tampered-source-generation'
    for receipt,descriptor in [(signed_receipt,signed),(pdf_receipt,pdf)]:
        with pytest.raises(ArtifactIntegrityError):o.attest(receipt,descriptor,authorization=env['snap'])
    assert env['store'].data['events']=={}
    with pytest.raises(ArtifactIntegrityError):o.get_bytes(pdf,authorization=env['snap'])


@pytest.mark.parametrize('receipt_count',[0,1,3])
def test_missing_or_extra_receipts_are_rejected_without_partial_visibility(env,receipt_count):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    candidates=() if receipt_count==0 else rs[:1] if receipt_count==1 else (*rs,rs[0])
    with pytest.raises(ArtifactIntegrityError):publish(env,cmd,candidates)
    unchanged(env,before)


def test_receipt_not_byte_visibility_and_fake_client_snapshot_not_authority(env):
    cmd,rs=bundle(env)
    with pytest.raises(ArtifactIntegrityError):env['objects'].get_bytes(rs[0].descriptor(),authorization=env['snap'])
    fake=replace(env['snap'],request_id=uuid4())
    with pytest.raises(AuthorizationError):env['objects'].verify_private(rs[0].descriptor(),authorization=fake)
    assert len(env['store'].data['events'])==0


def test_read_only_grant_can_read_without_implicit_write_grant(env):
    cmd,rs=bundle(env);publish(env,cmd,rs);refresh(env)
    snap=env['snap'];ca=replace(snap.case,grants=frozenset({(Role.ENGINEER,Permission.ARTIFACT_READ,None)}))
    reader=replace(snap,case=ca);env['authz'].admit_fixture_snapshot(reader)
    assert env['objects'].get_bytes(rs[0].descriptor(),authorization=reader)==b'SYNTHETIC_EXCEL'
    with pytest.raises(AuthorizationError):env['objects'].verify_private(rs[0].descriptor(),authorization=reader)


def test_reference_pending_blocks_cleanup(env):
    cmd,rs=bundle(env);env['clock'].value+=11
    def inspect_pending():
        for r in rs:
            assert env['objects'].phases[r.artifact_id]==StoragePhase.REFERENCE_PENDING
            assert env['objects'].inspect(r,authorization=env['snap'])=='NO_DELETE'
    publish(env,cmd,rs,before_commit=inspect_pending)


def test_python_optimized_test_double_rejects_client_receipt_without_assert():
    script='''
import socket

def blocked(*args, **kwargs): raise RuntimeError('external network forbidden')
socket.socket.connect=blocked
socket.socket.connect_ex=blocked
socket.create_connection=blocked
socket.getaddrinfo=blocked
from uuid import uuid4
from conftest import NOW
from repository_contract.fakes import MemoryStore
from repository_contract.test_contract import Clock, trusted
from receipt_reference.fakes import SyntheticAuthority, SyntheticObjects
from app.domain.permissions import Role
from app.domain.states import Stage, Substate
from app.schemas.requests import CaseState
from app.schemas.artifacts import describe_server_bytes, ArtifactIntegrityError
from app.core.errors import AuthorizationError
from dataclasses import replace
case=CaseState(request_id=uuid4(),tenant_id=uuid4(),requester_id=uuid4(),supervisor_id=uuid4(),
    assignee_ids=frozenset({uuid4()}),stage=Stage.REPORT_PROCESSING,substate=Substate.PENDING_REPORT,version=1)
store=MemoryStore([case]);clock=Clock();snap=trusted(store,case,Role.ENGINEER)
authz=SyntheticAuthority(store,clock);authz.admit_fixture_snapshot(snap)
objects=SyntheticObjects(store,clock,authz,receipt_ttl=300,grace_period=10)
revision=uuid4();objects.bind_revision_for_test(case,revision)
d=describe_server_bytes(b'synthetic',authorization=snap,revision_id=revision,artifact_kind='original_excel',display_name='test')
objects.bind_original_for_test(d);objects.put_new_bytes(d,b'synthetic',authorization=snap)
r=objects.verify_private(d,authorization=snap)
for call,error in [(lambda: objects.attest(r.model_copy(update={'storage_generation':'fake'}),d,authorization=snap),ArtifactIntegrityError),
                   (lambda: objects.get_bytes(d,authorization=replace(snap,request_id=uuid4())),AuthorizationError)]:
    try:call()
    except error:pass
    else:raise SystemExit('Optimized mode bypassed refusal')
if store.data['events'] or any(row['published'] for row in objects._objects.values()):
    raise SystemExit('Unexpected publication')
'''
    result=subprocess.run([sys.executable,'-O','-c',script],capture_output=True,text=True,timeout=30,
        cwd=Path(__file__).parents[2],env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1',
                                          'PYTHONPATH':str(Path(__file__).parents[1])})
    assert result.returncode==0,result.stderr


def test_second_revision_publication_preserves_old_receipts_bytes_signatures_and_cleanup_protection(env):
    first_cmd,first_receipts=bundle(env);first=publish(env,first_cmd,first_receipts)
    old=deepcopy_objects(env)
    # Trusted fixture models the already-confirmed return-to-processing boundary;
    # it is not a new workflow transition, API or business gate bypass.
    c=state(first.state,stage=Stage.REPORT_PROCESSING,substate=Substate.RETURNED,version=first.state.version+1)
    env['store'].data['cases'][(c.tenant_id,c.request_id)]=c;env['case']=c
    env['revision']=uuid4();env['objects'].bind_revision_for_test(c,env['revision']);refresh(env)
    cmd,rs=bundle(env);cmd=cmd.model_copy(update={'idempotency_key':'new-revision-key'})
    second=publish(env,cmd,rs);refresh(env);env['clock'].value+=11
    assert len(second.state.reports)==2 and second.state.reports[0]==first.state.reports[0]
    assert not {r.artifact_id for r in first_receipts}&{r.artifact_id for r in rs}
    for r in first_receipts:
        assert env['objects'].inspect_for_test()[r.artifact_id]==old[r.artifact_id]
        assert env['objects'].get_bytes(r.descriptor(),authorization=env['snap'])==old[r.artifact_id]['content']
        assert env['objects'].inspect(r,authorization=env['snap'])=='NO_DELETE'
    assert len(env['store'].data['events'])==len(env['store'].data['audits'])==2


def test_response_lost_then_outcome_service_recovers_without_republication(env):
    cmd,rs=bundle(env)
    with pytest.raises(TimeoutError):publish(env,cmd,rs,fault='response_lost')
    refresh(env);env['objects'].outcomes_available=False;env['clock'].value+=11
    before=env['store'].snapshot()
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='UNKNOWN'
    assert env['objects'].inspect(rs[0],authorization=env['snap'])=='NO_DELETE'
    env['objects'].outcomes_available=True
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='CONFIRMED'
    assert env['store'].snapshot()==before


@pytest.mark.parametrize('entry',['publish_synthetic_for_test','append_revision'])
def test_legacy_fixture_publication_shortcuts_stay_blocked(env,entry):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    with pytest.raises(RuleNotApprovedError):getattr(env['objects'],entry)()
    unchanged(env,before)


def test_unexpected_visibility_failure_restores_entire_synthetic_uow(env):
    cmd,rs=bundle(env);before=env['store'].snapshot()
    with pytest.raises(RuntimeError,match='SYNTHETIC_VISIBILITY_FAILURE'):
        publish(env,cmd,rs,fault='visibility_failure')
    unchanged(env,before)
    assert env['publisher'].reconcile(cmd,rs,authorization=env['snap']).status=='NOT_COMMITTED'
