from dataclasses import replace
from uuid import uuid4
import pytest
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.domain.permissions import Permission, Role


def evaluate(env,context,permission=Permission.REPORT_REVIEW):
    s = context.resolve()
    return SnapshotPermissionEvaluator(s,context.ports,env.clock,mode='TEST_ONLY',review_level=2).evaluate(s.actor,s.case.scope,permission)


@pytest.mark.parametrize('kind',['requester','author','assignee','supervisor'])
def test_RBAC_01(env,context,kind):
    p=context.ports
    if kind=='author': p.case=replace(p.case,report_authors=frozenset({p.actor}))
    elif kind=='assignee': p.case=replace(p.case,scope=replace(p.case.scope,assignee_ids=frozenset({p.actor})))
    else: p.case=replace(p.case,scope=replace(p.case.scope,**{kind+'_id':p.actor}))
    assert not evaluate(env,context).allowed


def test_RBAC_02(env,context):
    context.ports.case=replace(context.ports.case,reviews=((context.ports.actor,1),))
    assert not evaluate(env,context).allowed


def test_RBAC_03(env,context):
    p=context.ports; p.member=replace(p.member,roles=frozenset({Role.ADMIN}))
    p.case=replace(p.case,grants=frozenset({(Role.ADMIN,Permission.REPORT_REVIEW,2)}))
    assert not evaluate(env,context).allowed


def test_RBAC_04(env,context):
    context.ports.case=replace(context.ports.case,grants=frozenset())
    assert not evaluate(env,context).allowed


def test_RBAC_05(env,context):
    assert not evaluate(env,context,'unknown').allowed
    assert not evaluate(env,context,'review_report').allowed


def test_RBAC_06(env,context):
    from app.authentication.errors import ResourceNotFound
    context.ports.case=replace(context.ports.case,related_actor_ids=frozenset())
    with pytest.raises(ResourceNotFound): context.resolve()


def test_RBAC_07(env,context):
    p=context.ports; p.member=replace(p.member,roles=frozenset({Role.LEVEL1,Role.LEVEL2,Role.ADMIN}))
    p.case=replace(p.case,reviews=((p.actor,1),))
    assert not evaluate(env,context).allowed
    s=context.resolve(); ev=SnapshotPermissionEvaluator(s,p,env.clock,mode='TEST_ONLY',review_level=2)
    assert not ev.evaluate(s.actor,replace(s.case.scope,tenant_id=uuid4()),Permission.REPORT_REVIEW).allowed


def test_RBAC_08(env,context):
    from app.domain.workflow import require_committable_business_operation
    from app.core.errors import RuleNotApprovedError
    p=context.ports; p.case=replace(p.case,reviews=((p.actor,2),))
    assert evaluate(env,context).allowed
    with pytest.raises(RuleNotApprovedError): require_committable_business_operation(None)
    s=context.resolve(); env.clock.value+=21
    assert not SnapshotPermissionEvaluator(s,p,env.clock,mode='TEST_ONLY',review_level=2).evaluate(s.actor,s.case.scope,Permission.REPORT_REVIEW).allowed
