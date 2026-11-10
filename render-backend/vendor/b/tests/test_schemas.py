from uuid import uuid4
import json
import pytest
from pydantic import ValidationError
from app.schemas.commands import CommandEnvelope
from app.schemas.common import RequestRef
from app.schemas.requests import CaseState
from app.domain.states import Stage,Substate


def valid():return {'command':{'action':'return_report','expected_version':1,'idempotency_key':'synthetic-key',
                             'reason':' correction ','content_revision_id':str(uuid4())}}


def test_valid_json_uuid_and_trimmed_reason():
    command=CommandEnvelope.model_validate_json(json.dumps(valid())).command
    assert command.reason=='correction'


@pytest.mark.parametrize('change',[
    {'action':'unknown'},{'expected_version':0},{'expected_version':-1},
    {'expected_version':True},{'expected_version':'1'},{'reason':'  '},
    {'reason':42},{'content_revision_id':'not-uuid'},{'actor_id':str(uuid4())},
    {'tenant_id':str(uuid4())},{'admin':True},{'state':'closed'},
    {'idempotency_key':' '},{'arbitrary_business_fields':{'x':1}}])
def test_invalid_or_injected_input(change):
    payload=valid();payload['command'].update(change)
    with pytest.raises(ValidationError):CommandEnvelope.model_validate_json(json.dumps(payload))


def test_unknown_envelope_field():
    payload=valid();payload['actor_id']=str(uuid4())
    with pytest.raises(ValidationError):CommandEnvelope.model_validate_json(json.dumps(payload))


def test_strict_python_uuid_and_version():
    with pytest.raises(ValidationError):RequestRef(request_id=str(uuid4()),optimistic_version=1)


def test_canonical_has_exactly_nine_stages():
    assert len(Stage)==9
    assert set(s.value for s in Stage)==set(range(1,10))


def test_incoherent_substate_rejected(case):
    with pytest.raises(ValidationError):CaseState.model_validate({**case.model_dump(),'stage':Stage.CLOSED,'substate':Substate.RUNNING})
