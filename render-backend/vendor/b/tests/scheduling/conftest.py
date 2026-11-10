"""TEST_ONLY evidence. No real equipment, tenants, engineers or database."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID
import socket
import pytest
from app.scheduling.models import (TimeWindow, MeasurementRange, Conditions, Equipment, Engineer,
    Qualification, Sample, TestRequirement, Reservation, CandidateSchedule, TrustedSnapshot)
from app.scheduling.constraints import REQUIRED_EVIDENCE
from app.scheduling.evaluator import evaluate_candidate

NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)
TENANT = UUID(int=1)


def updated(model, **changes):
    return type(model).model_validate({**model.model_dump(), **changes})


def window(start, end):
    return TimeWindow(start_time=start, end_time=end)


def conditions(temperature='25', humidity='50'):
    return Conditions(temperature=MeasurementRange(minimum=Decimal(temperature), maximum=Decimal(temperature),unit='degC'),
        humidity=MeasurementRange(minimum=Decimal(humidity), maximum=Decimal(humidity),unit='%RH'))


class TestClock:
    __test__ = False
    def now(self): return NOW


@pytest.fixture
def plan():
    horizon=window(NOW, NOW+timedelta(days=2))
    c=conditions()
    equipment=Equipment(tenant_id=TENANT,equipment_id=UUID(int=100),status='ready',capacity=4,
        available_space=Decimal('10'),space_unit='L',channels=4,
        supported_temperature=MeasurementRange(minimum=Decimal('-40'),maximum=Decimal('150'),unit='degC'),
        supported_humidity=MeasurementRange(minimum=Decimal('0'),maximum=Decimal('100'),unit='%RH'),
        preparation_time=timedelta(minutes=10),transition_time=timedelta(minutes=5),cleanup_time=timedelta(minutes=10),
        availability=(horizon,))
    engineer=Engineer(tenant_id=TENANT,engineer_id=UUID(int=200),
        qualifications=(Qualification(test_type='TEST_ONLY_thermal',valid_from=NOW-timedelta(days=1),
            valid_until=horizon.end_time,evidence_reference='TEST_ONLY_CERT'),),availability=(horizon,),assigned_work=())
    samples=tuple(Sample(tenant_id=TENANT,sample_id=UUID(int=300+i),required_space=Decimal('2'),
        space_unit='L',required_channels=1,requested_conditions=c) for i in range(2))
    requirement=TestRequirement(tenant_id=TENANT,request_id=UUID(int=400),test_item_id=UUID(int=401),
        test_type='TEST_ONLY_thermal',scheduling_state='new_unassigned',equipment_count=1,sample_ids=frozenset(s.sample_id for s in samples),conditions=c)
    reservation=Reservation(tenant_id=TENANT,reservation_id=UUID(int=500),request_id=requirement.request_id,
        test_item_id=requirement.test_item_id,equipment_id=equipment.equipment_id,engineer_id=engineer.engineer_id,
        start_time=NOW+timedelta(hours=2),end_time=NOW+timedelta(hours=3),
        sample_ids=requirement.sample_ids,reserved_capacity=2,reserved_space=Decimal('4'),space_unit='L',
        reserved_channels=2,conditions=c,status='proposed')
    candidate=CandidateSchedule(proposed_reservations=(reservation,),source='TEST_ONLY',expected_version=7,intent='new_reservation')
    snapshot=TrustedSnapshot(mode='TEST_ONLY',tenant_id=TENANT,version=7,as_of=NOW-timedelta(minutes=1),
        valid_until=NOW+timedelta(minutes=5),horizon=horizon,complete_evidence=REQUIRED_EVIDENCE,
        equipment=(equipment,),engineers=(engineer,),samples=samples,requirements=(requirement,),reservations=(),maintenance=())
    return SimpleNamespace(candidate=candidate,snapshot=snapshot,row=reservation,equipment=equipment,
        engineer=engineer,requirement=requirement,clock=TestClock())


def assess(plan, candidate=None, snapshot=None):
    return evaluate_candidate(candidate or plan.candidate,snapshot or plan.snapshot,evaluated_at=NOW)


def existing(plan, **changes):
    return updated(plan.row,reservation_id=UUID(int=600),request_id=UUID(int=601),test_item_id=UUID(int=602),
        status='planned',**changes)


# Supplement unchanged base guards; reject UDP and alternate DNS APIs from collection.
_extra_network_guard=pytest.MonkeyPatch()


def blocked(*args, **kwargs):
    raise RuntimeError('External network forbidden in scheduling tests')


for name in ('sendto','sendmsg','sendmsg_afalg'):
    if hasattr(socket.socket,name): _extra_network_guard.setattr(socket.socket,name,blocked)
for name in ('gethostbyname','gethostbyname_ex','gethostbyaddr','getnameinfo'):
    _extra_network_guard.setattr(socket,name,blocked)


def pytest_unconfigure(config):
    _extra_network_guard.undo()
