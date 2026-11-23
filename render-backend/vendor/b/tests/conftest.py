from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import socket
import pytest
from app.authz.interfaces import ActorContext, PermissionDecision
from app.domain.permissions import Role, Permission
from app.domain.states import Stage, Substate
from app.schemas.requests import CaseState
from app.schemas.common import SignatureRef, ArtifactHashRef
from app.schemas.reports import ReportRevisionRef

NOW = datetime(2026, 11, 5, 9, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def deny_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise RuntimeError("External network forbidden in offline tests")
    monkeypatch.setattr(socket.socket,"connect",blocked)
    monkeypatch.setattr(socket.socket,"connect_ex",blocked)
    monkeypatch.setattr(socket,"create_connection",blocked)
    monkeypatch.setattr(socket,"getaddrinfo",blocked)


@pytest.fixture
def case():
    return CaseState(request_id=uuid4(),tenant_id=uuid4(),requester_id=uuid4(),supervisor_id=uuid4(),
        assignee_ids=frozenset({uuid4()}),stage=Stage.REVIEW,substate=Substate.RETURNED,
        version=1,planned_end=NOW-timedelta(hours=1),reservation_ids=(uuid4(),uuid4()),
        execution_record_ids=(uuid4(),))


def actor(case, role, actor_id=None):
    if actor_id is None:
        actor_id={Role.REQUESTER:case.requester_id,Role.REQUEST_MANAGER:case.supervisor_id,
                  Role.ENGINEER:next(iter(case.assignee_ids))}.get(role,uuid4())
    return ActorContext(actor_id,case.tenant_id,True,frozenset({role}),frozenset({case.request_id}))


class AllowForTest:
    """Explicit synthetic evaluator, never imported by production code."""
    def evaluate(self,actor,scope,permission):
        return PermissionDecision(isinstance(permission,Permission),"SYNTHETIC_TEST_ONLY")


def signature(actor_id):
    return SignatureRef(artifact_id=uuid4(),sha256="a"*64,signer_id=actor_id)


def revision(number=1):
    return ReportRevisionRef(content_revision_id=uuid4(),revision_number=number,
        original=ArtifactHashRef(artifact_id=uuid4(),sha256="b"*64))


def state(case, **changes):
    return CaseState.model_validate({**case.model_dump(),**changes})


_session_network_guard = None


def pytest_sessionstart(session):
    global _session_network_guard
    _session_network_guard = pytest.MonkeyPatch()
    def blocked(*args, **kwargs):
        raise RuntimeError('External network forbidden during collection and execution')
    _session_network_guard.setattr(socket.socket,'connect',blocked)
    _session_network_guard.setattr(socket.socket,'connect_ex',blocked)
    _session_network_guard.setattr(socket,'create_connection',blocked)
    _session_network_guard.setattr(socket,'getaddrinfo',blocked)


def pytest_sessionfinish(session, exitstatus):
    if _session_network_guard is not None:
        _session_network_guard.undo()
