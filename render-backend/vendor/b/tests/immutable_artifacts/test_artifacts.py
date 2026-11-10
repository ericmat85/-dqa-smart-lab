from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from hashlib import sha256
from uuid import uuid4
import pytest
from pydantic import ValidationError
from app.authz.adapters.context import AuthorizationSnapshot
from app.authentication.errors import AuthContextUnavailable
from app.core.errors import AuthorizationError, RuleNotApprovedError
from app.domain.permissions import Role, Permission
from app.domain.states import Stage, Substate
from app.domain.workflow import require_committable_business_operation
from app.schemas.artifacts import (ArtifactDescriptor, ArtifactIntegrityError, ArtifactUnavailableError,
    describe_server_bytes, hash_reference)
from app.schemas.common import SignatureRef
from app.schemas.commands import SubmitReport, PendingRule
from app.schemas.reports import ReportRevisionRef
from conftest import NOW, state
from repository_contract.fakes import MemoryStore, MemoryUnitOfWork
from repository_contract.test_contract import Clock, trusted
from .fakes import MemoryArtifacts


@pytest.fixture
def env(case):
    store = MemoryStore([case]); clock = Clock(); snap = trusted(store,case,Role.ENGINEER)
    repo = MemoryArtifacts(store,clock); revision_id = uuid4()
    repo.bind_revision_for_test(case,revision_id)
    return case,store,clock,snap,repo,revision_id


def descriptor(env, content=b'SYNTHETIC_EXCEL_V1', kind='original_excel', *, sources=(), revision=None, snapshot=None, name='same-name.xlsx'):
    return describe_server_bytes(content,authorization=snapshot or env[3],revision_id=revision or env[5],
        artifact_kind=kind,display_name=name,source_artifact_ids=tuple(sources))


def save(env, ref, content, *, snapshot=None, publish=True):
    repo=env[4];snap=snapshot or env[3]
    repo.put_new_bytes(ref,content,authorization=snap)
    if publish:repo.publish_synthetic_for_test((ref,),authorization=snap)


def report_set(env, *, revision=None, suffix=b'1'):
    refs=[]
    original=descriptor(env,b'EXCEL'+suffix,revision=revision);save(env,original,b'EXCEL'+suffix);refs.append(original)
    sig=descriptor(env,b'SIGNATURE'+suffix,'signature_image',revision=revision,name='same-signature.png');save(env,sig,b'SIGNATURE'+suffix);refs.append(sig)
    signed=descriptor(env,b'SIGNED'+suffix,'signed_excel',sources=(original.artifact_id,sig.artifact_id),revision=revision);save(env,signed,b'SIGNED'+suffix);refs.append(signed)
    pdf=descriptor(env,b'PDF'+suffix,'report_pdf',sources=(signed.artifact_id,),revision=revision,name='report.pdf');save(env,pdf,b'PDF'+suffix);refs.append(pdf)
    return refs


def revision_ref(refs, number=1):
    original,sig,signed,pdf=refs
    return ReportRevisionRef(content_revision_id=original.revision_id,revision_number=number,
        original=hash_reference(original),signatures=(SignatureRef(artifact_id=sig.artifact_id,sha256=sig.sha256,signer_id=sig.signer_id),),
        signed_artifacts=(hash_reference(signed),hash_reference(pdf)))


def test_new_revision_preserves_old_excel_signatures_and_derived_bytes(env):
    first=report_set(env);before=env[4].inspect_for_test()
    revision=uuid4();env[4].bind_revision_for_test(env[0],revision)
    second=report_set(env,revision=revision,suffix=b'2')
    for refs,suffix in [(first,b'1'),(second,b'2')]:
        for ref,prefix in zip(refs,[b'EXCEL',b'SIGNATURE',b'SIGNED',b'PDF']):
            data=env[4].get_bytes(ref,authorization=env[3])
            assert data==prefix+suffix
            assert sha256(data).hexdigest()==ref.sha256
            assert len(data)==ref.content_length
    assert not {r.artifact_id for r in first}&{r.artifact_id for r in second}
    assert all(env[4].inspect_for_test()[k]==v for k,v in before.items())
    assert first[0].display_name==second[0].display_name


def test_server_derives_scope_owner_digest_and_fresh_id(env):
    content=b'SYNTHETIC';a=descriptor(env,content);b=descriptor(env,content)
    assert a.artifact_id!=b.artifact_id
    assert (a.tenant_id,a.case_id,a.created_by)==(env[0].tenant_id,env[0].request_id,env[3].actor.actor_id)
    assert a.sha256==sha256(content).hexdigest() and a.content_length==len(content)


@pytest.mark.parametrize('field,value', [('sha256','f'*64),('content_length',999),('content_length',True),('artifact_kind','unknown')])
def test_wrong_digest_length_and_unchecked_metadata_rejected(env, field, value):
    ref=descriptor(env);bad=ref.model_copy(update={field:value});before=env[4].inspect_for_test()
    with pytest.raises(ArtifactIntegrityError):env[4].put_new_bytes(bad,b'SYNTHETIC_EXCEL_V1',authorization=env[3])
    assert env[4].inspect_for_test()==before


@pytest.mark.parametrize('content',[b'',None,'text',bytearray(b'abc'),memoryview(b'abc'),123])
def test_invalid_content_rejected_without_storage(env,content):
    with pytest.raises(ArtifactIntegrityError):describe_server_bytes(content,authorization=env[3],revision_id=env[5],artifact_kind='original_excel',display_name='fake.xlsx')
    ref=descriptor(env)
    with pytest.raises(ArtifactIntegrityError):env[4].put_new_bytes(ref,content,authorization=env[3])
    assert env[4].inspect_for_test()=={}


@pytest.mark.parametrize('content',[b'changed',b'SYNTHETIC_EXCEL_V2',None,bytearray(b'SYNTHETIC_EXCEL_V1')])
def test_read_revalidates_content_and_returns_no_partial_result(env,content):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    env[4]._objects[ref.artifact_id]['content']=content
    before=env[4].inspect_for_test()
    with pytest.raises(ArtifactIntegrityError):env[4].get_bytes(ref,authorization=env[3])
    assert env[4].inspect_for_test()==before


@pytest.mark.parametrize('field', ['content_length','sha256','created_by','source_artifact_ids'])
def test_metadata_tampering_on_read_rejected(env,field):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    values={'content_length':1,'sha256':'f'*64,'created_by':uuid4(),'source_artifact_ids':(uuid4(),)}
    env[4]._objects[ref.artifact_id]['descriptor']=ref.model_copy(update={field:values[field]})
    with pytest.raises(ArtifactIntegrityError):env[4].get_bytes(ref,authorization=env[3])


@pytest.mark.parametrize('operation',['read','write'])
@pytest.mark.parametrize('dimension',['tenant','case','revision','kind'])
def test_wrong_scope_revision_or_kind_rejected(env,operation,dimension):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    changes={'tenant':{'tenant_id':uuid4()},'case':{'case_id':uuid4()},'revision':{'revision_id':uuid4()},'kind':{'artifact_kind':'signature_image','signer_id':ref.created_by}}
    bad=ref.model_copy(update=changes[dimension]);before=env[4].inspect_for_test()
    with pytest.raises((AuthorizationError,ArtifactIntegrityError)):
        if operation=='read':env[4].get_bytes(bad,authorization=env[3])
        else:env[4].put_new_bytes(bad,b'SYNTHETIC_EXCEL_V1',authorization=env[3])
    assert env[4].inspect_for_test()==before


def test_registered_but_wrong_revision_still_rejected(env):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1');other=uuid4();env[4].bind_revision_for_test(env[0],other)
    with pytest.raises(ArtifactIntegrityError):env[4].get_bytes(ref.model_copy(update={'revision_id':other}),authorization=env[3])


def test_unknown_artifact_and_unpublished_bytes_are_unavailable(env):
    ref=descriptor(env)
    with pytest.raises(ArtifactUnavailableError):env[4].get_bytes(ref,authorization=env[3])
    save(env,ref,b'SYNTHETIC_EXCEL_V1',publish=False)
    with pytest.raises(ArtifactUnavailableError):env[4].get_bytes(ref,authorization=env[3])


@pytest.mark.parametrize('published',[False,True])
def test_duplicate_artifact_id_never_overwrites_even_identical_bytes(env,published):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1',publish=published);before=env[4].inspect_for_test()
    with pytest.raises(ArtifactIntegrityError):env[4].put_new_bytes(ref,b'SYNTHETIC_EXCEL_V1',authorization=env[3])
    assert env[4].inspect_for_test()==before


@pytest.mark.parametrize('failure',['before_store','before_publish','batch_integrity'])
def test_write_or_batch_failure_does_not_partially_publish(env,failure):
    a=descriptor(env);b=descriptor(env,b'B');repo=env[4]
    if failure=='before_store':
        with pytest.raises(RuntimeError):repo.put_new_bytes(a,b'SYNTHETIC_EXCEL_V1',authorization=env[3],fail_before_store=True)
        assert repo.inspect_for_test()=={}
        with pytest.raises(ArtifactIntegrityError):repo.put_new_bytes(a,b'SYNTHETIC_EXCEL_V1',authorization=env[3])
        return
    save(env,a,b'SYNTHETIC_EXCEL_V1',publish=False);save(env,b,b'B',publish=False)
    if failure=='batch_integrity':repo._objects[b.artifact_id]['content']=b'bad'
    before=repo.inspect_for_test()
    with pytest.raises(RuntimeError if failure=='before_publish' else ArtifactIntegrityError):
        repo.publish_synthetic_for_test((a,b),authorization=env[3],fail_before_publish=failure=='before_publish')
    assert repo.inspect_for_test()==before
    for ref in (a,b):
        with pytest.raises(ArtifactUnavailableError):repo.get_bytes(ref,authorization=env[3])


@pytest.mark.parametrize('mode',['missing_grant','admin','revoked','expired','identity_expired','forged_actor','no_snapshot'])
@pytest.mark.parametrize('operation',['read','write','publish'])
def test_untrusted_revoked_expired_and_admin_contexts_denied(env,mode,operation):
    ref=descriptor(env);repo=env[4];snap=env[3]
    if operation!='write':save(env,ref,b'SYNTHETIC_EXCEL_V1',publish=operation=='read')
    if mode=='missing_grant':snap=replace(snap,case=replace(snap.case,grants=frozenset()))
    if mode=='admin':
        who=replace(snap.actor,roles=frozenset({Role.ADMIN}))
        snap=replace(snap,actor=who,case=replace(snap.case,grants=frozenset((Role.ADMIN,p,None) for p in Permission)))
    if mode=='revoked':env[1].revoke(snap.actor)
    if mode=='expired':snap=replace(snap,expires_at=env[2].now())
    if mode=='identity_expired':snap=replace(snap,identity_expires_at=env[2].now())
    if mode=='forged_actor':snap=replace(snap,actor=replace(snap.actor,actor_id=uuid4()))
    if mode=='no_snapshot':snap={'tenant_id':ref.tenant_id,'admin':True}
    before=repo.inspect_for_test()
    with pytest.raises(AuthorizationError):
        if operation=='read':repo.get_bytes(ref,authorization=snap)
        elif operation=='write':repo.put_new_bytes(ref,b'SYNTHETIC_EXCEL_V1',authorization=snap)
        else:repo.publish_synthetic_for_test((ref,),authorization=snap)
    assert repo.inspect_for_test()==before


def test_write_grant_does_not_imply_read_and_read_does_not_imply_write(env):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    for granted,denied in [(Permission.ARTIFACT_WRITE,'read'),(Permission.ARTIFACT_READ,'write')]:
        snap=replace(env[3],case=replace(env[3].case,grants=frozenset({(Role.ENGINEER,granted,None)})))
        with pytest.raises(AuthorizationError):
            if denied=='read':env[4].get_bytes(ref,authorization=snap)
            else:env[4].put_new_bytes(descriptor(env,b'NEW'),b'NEW',authorization=snap)


def test_no_client_owner_digest_or_approved_signature_injection(env):
    ref=descriptor(env)
    with pytest.raises(AuthorizationError):env[4].put_new_bytes(ref.model_copy(update={'created_by':uuid4()}),b'SYNTHETIC_EXCEL_V1',authorization=env[3])
    with pytest.raises(TypeError):describe_server_bytes(b'A',authorization=env[3],revision_id=env[5],artifact_kind='signature_image',display_name='sig',sha256='f'*64)
    with pytest.raises(ValidationError):ArtifactDescriptor.model_validate({**ref.model_dump(),'approved':True})


@pytest.mark.parametrize('source_case',['unknown','wrong_revision','wrong_case','missing_signature','tampered'])
def test_derived_artifact_sources_are_verified(env,source_case):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    source=ref.artifact_id
    if source_case=='unknown':source=uuid4()
    if source_case=='wrong_revision':
        rev=uuid4();env[4].bind_revision_for_test(env[0],rev);other=descriptor(env,b'O',revision=rev);save(env,other,b'O');source=other.artifact_id
    if source_case=='wrong_case':
        other=state(env[0],request_id=uuid4());env[1].data['cases'][(other.tenant_id,other.request_id)]=other
        snap=trusted(env[1],other,Role.ENGINEER);env[4].bind_revision_for_test(other,env[5])
        other_ref=describe_server_bytes(b'O',authorization=snap,revision_id=env[5],artifact_kind='original_excel',display_name='other')
        env[4].put_new_bytes(other_ref,b'O',authorization=snap);source=other_ref.artifact_id
    if source_case=='tampered':env[4]._objects[source]['content']=b'BAD'
    derived=descriptor(env,b'D','signed_excel' if source_case=='missing_signature' else 'report_pdf',sources=(source,))
    with pytest.raises((ArtifactIntegrityError,ArtifactUnavailableError)):env[4].put_new_bytes(derived,b'D',authorization=env[3])


def test_concurrent_duplicate_id_only_one_write(env):
    ref=descriptor(env)
    def write(_):
        try:env[4].put_new_bytes(ref,b'SYNTHETIC_EXCEL_V1',authorization=env[3]);return 'stored'
        except ArtifactIntegrityError:return 'rejected'
    with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(write,range(2)))
    assert sorted(outcomes)==['rejected','stored']
    assert len(env[4].inspect_for_test())==1


@pytest.mark.parametrize('corruption',['digest','revision','kind','signer','duplicate','unpublished','unknown'])
def test_invalid_report_metadata_never_publishes_p5_05_references(env,corruption):
    refs=report_set(env);rev=revision_ref(refs)
    if corruption=='digest':rev=rev.model_copy(update={'original':rev.original.model_copy(update={'sha256':'f'*64})})
    if corruption=='revision':rev=rev.model_copy(update={'content_revision_id':uuid4()})
    if corruption=='kind':rev=rev.model_copy(update={'original':hash_reference(refs[3])})
    if corruption=='signer':rev=rev.model_copy(update={'signatures':(rev.signatures[0].model_copy(update={'signer_id':uuid4()}),)})
    if corruption=='duplicate':rev=rev.model_copy(update={'signed_artifacts':(rev.signed_artifacts[0],)*2})
    if corruption=='unpublished':env[4]._objects[refs[0].artifact_id]['published']=False
    if corruption=='unknown':rev=rev.model_copy(update={'original':rev.original.model_copy(update={'artifact_id':uuid4()})})
    before=env[1].snapshot()
    with pytest.raises((ArtifactIntegrityError,ArtifactUnavailableError)):
        env[4].append_revision(env[0].tenant_id,env[0].request_id,rev,authorization=env[3])
    assert env[1].snapshot()==before
    assert env[4]._revision_refs=={}


def test_p5_05_uow_accepts_only_verified_bytes_references(env):
    case=state(env[0],stage=Stage.REPORT_PROCESSING,substate=Substate.PENDING_REPORT)
    env[1].data['cases'][(case.tenant_id,case.request_id)]=case
    refs=report_set(env);original,sig,signed,pdf=refs
    # Metadata publication does not grant business approval/signatures.
    env[4].append_revision(case.tenant_id,case.request_id,revision_ref(refs),authorization=env[3])
    draft=ReportRevisionRef(content_revision_id=original.revision_id,revision_number=1,original=hash_reference(original))
    sign=SignatureRef(artifact_id=sig.artifact_id,sha256=sig.sha256,signer_id=sig.signer_id)
    with MemoryUnitOfWork(env[1],env[3],env[2]) as u:
        result=u.prepare(SubmitReport(action='submit_report_revision',revision=draft,executor_signature=sign,
            expected_version=1,idempotency_key='synthetic-report'),event_id=uuid4(),now=NOW)
        with pytest.raises(RuleNotApprovedError):require_committable_business_operation(result)
        u.publish_synthetic_for_test()
    assert env[4].get_bytes(original,authorization=trusted(env[1],result.state,Role.ENGINEER))==b'EXCEL1'
    assert len(env[1].data['revisions'])==1


def test_metadata_failure_leaves_bytes_as_separate_orphan_not_a_db_commit(env):
    refs=report_set(env);before=env[1].snapshot();objects=env[4].inspect_for_test()
    with pytest.raises(RuntimeError):env[4].append_revision(env[0].tenant_id,env[0].request_id,
        revision_ref(refs),authorization=env[3],fail_before_reference_publish=True)
    assert env[1].snapshot()==before and env[4].inspect_for_test()==objects
    assert env[4]._revision_refs=={}
    env[4].append_revision(env[0].tenant_id,env[0].request_id,revision_ref(refs),authorization=env[3])
    before=env[1].snapshot()
    with pytest.raises(ArtifactIntegrityError):env[4].append_revision(env[0].tenant_id,env[0].request_id,revision_ref(refs),authorization=env[3])
    assert env[1].snapshot()==before


def test_auth_source_failure_and_clock_failure_fail_closed(env):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    def broken(*args):raise RuntimeError('synthetic-private-provider-error')
    env[1].validate=broken
    with pytest.raises(AuthContextUnavailable) as error:env[4].get_bytes(ref,authorization=env[3])
    assert 'synthetic-private-provider-error' not in str(error.value)


def test_business_gate_and_pending_policy_still_blocked(env):
    with pytest.raises(RuleNotApprovedError):env[4].commit()
    with MemoryUnitOfWork(env[1],env[3],env[2]) as u:
        with pytest.raises(RuleNotApprovedError):u.prepare(PendingRule(action='release_equipment',expected_version=1,idempotency_key='pending'),event_id=uuid4(),now=NOW)


def test_other_signer_has_independent_image_without_approval_power(env):
    first=descriptor(env,b'ONE','signature_image');save(env,first,b'ONE')
    signer=trusted(env[1],env[0],Role.LEVEL2)
    second=descriptor(env,b'TWO','signature_image',snapshot=signer)
    save(env,second,b'TWO',snapshot=signer)
    reader=replace(signer,case=replace(signer.case,grants=frozenset({(Role.LEVEL2,Permission.ARTIFACT_READ,None)})))
    assert env[4].get_bytes(first,authorization=reader)==b'ONE'
    assert env[4].get_bytes(second,authorization=reader)==b'TWO'
    assert first.signer_id!=second.signer_id
    before=env[1].snapshot()
    with pytest.raises(RuleNotApprovedError):env[4].commit()
    assert env[1].snapshot()==before


def test_tampered_source_chain_rejected_on_derived_read(env):
    original,sig,signed,pdf=report_set(env)
    env[4]._objects[original.artifact_id]['content']=b'CORRUPTED_ORIGINAL'
    for ref in (signed,pdf):
        with pytest.raises(ArtifactIntegrityError):env[4].get_bytes(ref,authorization=env[3])


def test_publish_requires_complete_source_batch(env):
    original=descriptor(env);save(env,original,b'SYNTHETIC_EXCEL_V1',publish=False)
    pdf=descriptor(env,b'PDF','report_pdf',sources=(original.artifact_id,));save(env,pdf,b'PDF',publish=False)
    with pytest.raises(ArtifactIntegrityError):env[4].publish_synthetic_for_test((pdf,),authorization=env[3])
    env[4].publish_synthetic_for_test((pdf,original),authorization=env[3])
    assert env[4].get_bytes(pdf,authorization=env[3])==b'PDF'


def test_clock_failure_is_constant_and_denies(env):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1');env[2].value=float('nan')
    with pytest.raises(AuthContextUnavailable):env[4].get_bytes(ref,authorization=env[3])


@pytest.mark.parametrize('changed',['membership_epoch','case_version'])
def test_stale_authoritative_snapshot_rejects_read(env,changed):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    with env[1].lock:
        if changed=='membership_epoch':env[1].members[(env[0].tenant_id,env[3].actor.actor_id)]='changed-epoch'
        else:env[1].data['cases'][(env[0].tenant_id,env[0].request_id)]=state(env[0],version=2)
    with pytest.raises(AuthorizationError):env[4].get_bytes(ref,authorization=env[3])


def test_duplicate_id_cannot_be_reassigned_to_another_authorized_tenant(env):
    ref=descriptor(env);save(env,ref,b'SYNTHETIC_EXCEL_V1')
    other=state(env[0],tenant_id=uuid4(),request_id=uuid4())
    env[1].data['cases'][(other.tenant_id,other.request_id)]=other
    snap=trusted(env[1],other,Role.ENGINEER);env[4].bind_revision_for_test(other,env[5])
    another=describe_server_bytes(b'OTHER',authorization=snap,revision_id=env[5],artifact_kind='original_excel',display_name='other')
    another=another.model_copy(update={'artifact_id':ref.artifact_id})
    before=env[4].inspect_for_test()
    with pytest.raises(ArtifactIntegrityError):env[4].put_new_bytes(another,b'OTHER',authorization=snap)
    assert env[4].inspect_for_test()==before


def test_optimized_artifact_guards_use_explicit_exceptions():
    import os
    from pathlib import Path
    import subprocess
    import sys
    script='''
import socket
def blocked(*a,**k):raise RuntimeError('external I/O forbidden')
socket.socket.connect=socket.socket.connect_ex=blocked
socket.create_connection=socket.getaddrinfo=blocked
from uuid import uuid4
from app.schemas.requests import CaseState
from app.domain.states import Stage,Substate
from app.domain.permissions import Role
from app.schemas.artifacts import describe_server_bytes,ArtifactIntegrityError
from app.core.errors import AuthorizationError,RuleNotApprovedError
from repository_contract.fakes import MemoryStore
from repository_contract.test_contract import Clock,trusted
from immutable_artifacts.fakes import MemoryArtifacts
c=CaseState(request_id=uuid4(),tenant_id=uuid4(),requester_id=uuid4(),supervisor_id=uuid4(),assignee_ids=frozenset({uuid4()}),stage=Stage.REPORT_PROCESSING,substate=Substate.PENDING_REPORT,version=1)
store=MemoryStore([c]);clock=Clock();a=trusted(store,c,Role.ENGINEER);repo=MemoryArtifacts(store,clock);rev=uuid4();repo.bind_revision_for_test(c,rev)
d=describe_server_bytes(b'SYNTHETIC',authorization=a,revision_id=rev,artifact_kind='original_excel',display_name='fake.xlsx')
try:repo.put_new_bytes(d,b'TAMPERED',authorization=a)
except ArtifactIntegrityError:pass
else:raise SystemExit('digest guard disabled')
if repo.inspect_for_test():raise SystemExit('failed write visible')
repo.put_new_bytes(d,b'SYNTHETIC',authorization=a);repo.publish_synthetic_for_test((d,),authorization=a)
try:repo.put_new_bytes(d,b'SYNTHETIC',authorization=a)
except ArtifactIntegrityError:pass
else:raise SystemExit('overwrite guard disabled')
if repo.get_bytes(d,authorization=a)!=b'SYNTHETIC':raise SystemExit('bytes changed')
repo._objects[d.artifact_id]['content']=b'CORRUPTED'
try:repo.get_bytes(d,authorization=a)
except ArtifactIntegrityError:pass
else:raise SystemExit('read integrity guard disabled')
store.revoke(a.actor)
try:repo.get_bytes(d,authorization=a)
except AuthorizationError:pass
else:raise SystemExit('revocation guard disabled')
try:repo.commit()
except RuleNotApprovedError:pass
else:raise SystemExit('business gate disabled')
'''
    result=subprocess.run([sys.executable,'-O','-c',script],cwd=Path(__file__).parents[2],
        env={**os.environ,'PYTHONPATH':'.:tests','PYTHONDONTWRITEBYTECODE':'1'},text=True,capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
