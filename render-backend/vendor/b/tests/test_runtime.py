"""Run explicit optimized guards without relying on test assertion rewriting."""
import os
from pathlib import Path
import subprocess
import sys


def test_optimized_production_guards_without_assert_rewriting():
    script = r'''
import socket

def blocked(*args, **kwargs): raise RuntimeError('external I/O forbidden')
socket.socket.connect=blocked
socket.socket.connect_ex=blocked
socket.create_connection=blocked
socket.getaddrinfo=blocked
from datetime import datetime, timezone
from uuid import uuid4
from app.schemas.commands import PendingRule,ResubmitRequest
from app.schemas.requests import CaseState
from app.domain.states import Stage,Substate
from app.domain.workflow import transition,require_committable_business_operation
from app.domain.permissions import Role
from app.authz.interfaces import ActorContext
from app.authz.deny import DenyByDefaultEvaluator
from app.core.errors import RuleNotApprovedError,AuthorizationError
case=CaseState(request_id=uuid4(),tenant_id=uuid4(),requester_id=uuid4(),supervisor_id=uuid4(),
 assignee_ids=frozenset(),stage=Stage.REVIEW,substate=Substate.RETURNED,version=1)
who=ActorContext(case.requester_id,case.tenant_id,True,frozenset({Role.REQUESTER}),frozenset({case.request_id}))
checks=0
for command,error in [
 (PendingRule(action='release_equipment',expected_version=1,idempotency_key='synthetic'),RuleNotApprovedError),
 (ResubmitRequest(action='resubmit_request',expected_version=1,idempotency_key='synthetic'),AuthorizationError)]:
 try: transition(case,command,who,DenyByDefaultEvaluator(),event_id=uuid4(),now=datetime.now(timezone.utc))
 except error: checks+=1
 else: raise SystemExit('optimized guard disabled')
try: require_committable_business_operation(None)
except RuleNotApprovedError: checks+=1
else: raise SystemExit('commit guard disabled')
if checks != 3: raise SystemExit('incomplete optimized checks')
'''
    result=subprocess.run([sys.executable,'-O','-c',script],cwd=Path(__file__).parents[1],
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},text=True,capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
