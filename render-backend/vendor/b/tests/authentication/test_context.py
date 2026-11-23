from dataclasses import replace
from uuid import uuid4
import pytest
from app.authentication.errors import AuthorizationDenied, ResourceNotFound, AuthContextUnavailable
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.domain.permissions import Permission


def test_CTX_01(context):
    context.ports.member = replace(context.ports.member, status='revoked')
    with pytest.raises(AuthorizationDenied): context.resolve()


def test_CTX_02(context):
    context.ports.member = replace(context.ports.member, status='suspended')
    with pytest.raises(AuthorizationDenied): context.resolve()


def test_CTX_03(context):
    with pytest.raises(AuthorizationDenied): context.resolve(uuid4())
    context.ports.case = replace(context.ports.case, scope=replace(context.ports.case.scope,tenant_id=uuid4()))
    with pytest.raises(ResourceNotFound): context.resolve()


def test_CTX_04(context):
    first = context.resolve()
    tenant = uuid4()
    context.ports.member = replace(context.ports.member,tenant_id=tenant)
    context.ports.case = replace(context.ports.case,scope=replace(context.ports.case.scope,tenant_id=tenant))
    second = context.resolve(tenant)
    assert first.actor.tenant_id != second.actor.tenant_id
    assert first.request_id != second.request_id and first.actor is not second.actor
    assert first.actor.tenant_id == context.ports.tenant
    assert len([c for c in context.ports.calls if len(c)==2]) == 2


def test_CTX_05(context):
    with pytest.raises(AuthorizationDenied):
        context.resolver.resolve(context.identity,None,context.ports.case_id,uuid4())


def test_CTX_06(env,context):
    identity = env.verifier.verify(env.token({'tenant_id':str(uuid4()),'app_metadata':{'admin':True}}))
    with pytest.raises(AuthorizationDenied):
        context.resolver.resolve(identity,uuid4(),context.ports.case_id,uuid4())


def test_CTX_07(context):
    with pytest.raises(AuthorizationDenied):
        context.resolver.resolve({'admin':True,'actor_id':str(context.ports.actor)},context.ports.tenant,context.ports.case_id,uuid4())
    with pytest.raises(TypeError): context.resolver.resolve(context.identity,context.ports.tenant,context.ports.case_id,uuid4(),admin=True)


def test_CTX_08(context):
    with pytest.raises(AuthorizationDenied):
        context.resolver.resolve(replace(context.identity,subject='unknown'),context.ports.tenant,context.ports.case_id,uuid4())
    assert len(context.ports.calls)==1


def test_CTX_09(context):
    context.ports.error = True
    with pytest.raises(AuthContextUnavailable): context.resolve()


def test_CTX_10(env,context):
    s = context.resolve()
    ev = SnapshotPermissionEvaluator(s,context.ports,env.clock,mode='TEST_ONLY',review_level=2)
    assert ev.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed
    context.ports.member = replace(context.ports.member,version='m2')
    assert not ev.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed
    context.ports.error = True
    with pytest.raises(AuthContextUnavailable): ev.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW)


def test_CTX_11(env,context):
    s = context.resolve(); context.ports.fresh=False
    ev = SnapshotPermissionEvaluator(s,context.ports,env.clock,mode='TEST_ONLY',review_level=2)
    assert not ev.evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed
    with pytest.raises(AuthorizationDenied): context.resolve()
