from datetime import timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo
import pytest
from pydantic import ValidationError
from app.scheduling.models import CandidateSchedule, MaintenanceWindow, TimeWindow
from .conftest import NOW, updated, window, conditions, assess, existing


def test_SCH_01_valid_candidate(plan):
    before=plan.snapshot.model_dump_json()
    decision=assess(plan)
    assert decision.allowed is True and decision.decision_code=='ALLOW_CANDIDATE_ONLY'
    assert decision.side_effects_authorized is False and decision.evaluated_snapshot_version==7
    assert decision.proposed_reservation_reference==plan.row.reservation_id
    assert plan.snapshot.model_dump_json()==before


@pytest.mark.parametrize('status',['disabled','maintenance','calibrating','unknown'])
def test_SCH_02_unavailable_equipment(plan,status):
    snapshot=updated(plan.snapshot,equipment=(updated(plan.equipment,status=status),))
    assert assess(plan,snapshot=snapshot).decision_code=='EQUIPMENT_UNAVAILABLE'


@pytest.mark.parametrize('kind,case_id',[('maintenance','SCH-03'),('calibration','SCH-04')])
def test_SCH_03_04_maintenance_windows(plan,kind,case_id):
    row=MaintenanceWindow(tenant_id=plan.snapshot.tenant_id,equipment_id=plan.row.equipment_id,
        kind=kind,start_time=plan.row.start_time,end_time=plan.row.end_time,reason='TEST_ONLY')
    assert assess(plan,snapshot=updated(plan.snapshot,maintenance=(row,))).decision_code=='EQUIPMENT_UNAVAILABLE'


def test_SCH_05_sample_capacity(plan):
    snapshot=updated(plan.snapshot,equipment=(updated(plan.equipment,capacity=1),))
    assert assess(plan,snapshot=snapshot).decision_code=='CAPACITY_EXCEEDED'


def test_SCH_06_sample_space(plan):
    samples=tuple(updated(s,required_space=Decimal('6')) for s in plan.snapshot.samples)
    snapshot=updated(plan.snapshot,samples=samples)
    candidate=updated(plan.candidate,proposed_reservations=(updated(plan.row,reserved_space=Decimal('12')),))
    assert assess(plan,candidate,snapshot).decision_code=='CAPACITY_EXCEEDED'


def test_SCH_07_channels(plan):
    snapshot=updated(plan.snapshot,equipment=(updated(plan.equipment,channels=1),))
    assert assess(plan,snapshot=snapshot).decision_code=='CAPACITY_EXCEEDED'


@pytest.mark.parametrize('condition,case_id',[(conditions('160','50'),'SCH-08'),(conditions('25','95'),'SCH-09')])
def test_SCH_08_09_environment_limits(plan,condition,case_id):
    equipment=updated(plan.equipment,supported_humidity=updated(plan.equipment.supported_humidity,maximum=Decimal('90')))
    snapshot=updated(plan.snapshot,equipment=(equipment,),
        requirements=(updated(plan.requirement,conditions=condition),),
        samples=tuple(updated(s,requested_conditions=condition) for s in plan.snapshot.samples))
    candidate=updated(plan.candidate,proposed_reservations=(updated(plan.row,conditions=condition),))
    assert assess(plan,candidate,snapshot).decision_code=='ENVIRONMENT_INCOMPATIBLE'


@pytest.mark.parametrize('field',['temperature','humidity'])
def test_SCH_10_missing_conditions(plan,field):
    candidate=updated(plan.candidate,proposed_reservations=(updated(plan.row,conditions=updated(plan.row.conditions,**{field:None})),))
    assert assess(plan,candidate).decision_code=='MISSING_REQUIRED_DATA'


def test_SCH_11_equipment_time_conflict(plan):
    other=existing(plan,engineer_id=UUID(int=999))
    decision=assess(plan,snapshot=updated(plan.snapshot,reservations=(other,)))
    assert not decision.allowed and 'TIME_CONFLICT' in decision.conflict_codes


def test_SCH_12_engineer_time_conflict(plan):
    equipment2=updated(plan.equipment,equipment_id=UUID(int=101))
    other=existing(plan,equipment_id=equipment2.equipment_id)
    snapshot=updated(plan.snapshot,equipment=(plan.equipment,equipment2),reservations=(other,))
    assert assess(plan,snapshot=snapshot).decision_code=='TIME_CONFLICT'


@pytest.mark.parametrize('buffer,minutes,case_id',[
    ('preparation_time',10,'SCH-13'),('transition_time',10,'SCH-14'),('cleanup_time',10,'SCH-15')])
def test_SCH_13_14_15_resource_buffers(plan,buffer,minutes,case_id):
    equipment=updated(plan.equipment,preparation_time=timedelta(0),transition_time=timedelta(0),cleanup_time=timedelta(0))
    equipment=updated(equipment,**{buffer:timedelta(minutes=minutes)})
    other=existing(plan,engineer_id=UUID(int=999),start_time=NOW+timedelta(hours=1),
        end_time=plan.row.start_time-timedelta(minutes=5))
    snapshot=updated(plan.snapshot,equipment=(equipment,),reservations=(other,))
    assert assess(plan,snapshot=snapshot).decision_code=='TIME_CONFLICT'


def test_SCH_16_engineer_without_qualification(plan):
    snapshot=updated(plan.snapshot,engineers=(updated(plan.engineer,qualifications=()),))
    assert assess(plan,snapshot=snapshot).decision_code=='ENGINEER_UNQUALIFIED'


def test_SCH_17_expired_qualification(plan):
    qualification=updated(plan.engineer.qualifications[0],valid_until=plan.row.end_time-timedelta(seconds=1))
    snapshot=updated(plan.snapshot,engineers=(updated(plan.engineer,qualifications=(qualification,)),))
    assert assess(plan,snapshot=snapshot).decision_code=='ENGINEER_UNQUALIFIED'


def test_SCH_18_engineer_unavailable(plan):
    snapshot=updated(plan.snapshot,engineers=(updated(plan.engineer,availability=()),))
    assert assess(plan,snapshot=snapshot).decision_code=='TIME_CONFLICT'


def test_SCH_19_snapshot_version(plan):
    assert assess(plan,updated(plan.candidate,expected_version=8)).decision_code=='STALE_SNAPSHOT'


@pytest.mark.parametrize('intent,case_id', [('reschedule_interrupted_trial','SCH-20'),
    ('release_equipment','SCH-21'),('supervisor_override','SCH-22')])
def test_SCH_20_21_22_unapproved_policy(plan,intent,case_id):
    decision=assess(plan,updated(plan.candidate,intent=intent))
    assert decision.decision_code=='RULE_NOT_APPROVED' and not decision.allowed


@pytest.mark.parametrize('forged,case_id',[({'equipment_capacity':1000},'SCH-23'),
    ({'engineer_qualification':True},'SCH-24'),({'allowed':True},'SCH-23'),
    ({'snapshot_version':999},'SCH-24'),({'maintenance_status':'clear'},'SCH-23')])
def test_SCH_23_24_ai_cannot_supply_evidence(plan,forged,case_id):
    data={**plan.candidate.model_dump(),'source':'ai',**forged}
    with pytest.raises(ValidationError): CandidateSchedule.model_validate(data)


def test_SCH_25_naive_datetime_rejected(plan):
    with pytest.raises(ValidationError): updated(plan.row,start_time=plan.row.start_time.replace(tzinfo=None))


def test_SCH_26_taipei_utc_equivalence(plan):
    row=updated(plan.row,start_time=plan.row.start_time.astimezone(ZoneInfo('Asia/Taipei')),
                end_time=plan.row.end_time.astimezone(ZoneInfo('Asia/Taipei')))
    assert row.start_time.utcoffset()==timedelta(0)
    assert assess(plan,updated(plan.candidate,proposed_reservations=(row,)))==assess(plan)


def test_SCH_27_adjacent_half_open_time(plan):
    equipment=updated(plan.equipment,preparation_time=timedelta(0),transition_time=timedelta(0),cleanup_time=timedelta(0))
    other=existing(plan,engineer_id=UUID(int=999),start_time=NOW+timedelta(hours=1),end_time=plan.row.start_time)
    assert assess(plan,snapshot=updated(plan.snapshot,equipment=(equipment,),reservations=(other,))).allowed


@pytest.mark.parametrize('value',[0,-1,True])
def test_SCH_28_invalid_capacity(plan,value):
    with pytest.raises(ValidationError): updated(plan.equipment,capacity=value)


def test_SCH_29_invalid_environment_unit(plan):
    with pytest.raises(ValidationError): updated(plan.row.conditions.temperature,unit='Fahrenheit')


@pytest.mark.parametrize('field',['equipment_id','engineer_id'])
def test_SCH_30_unknown_resources(plan,field):
    candidate=updated(plan.candidate,proposed_reservations=(updated(plan.row,**{field:UUID(int=999)}),))
    assert assess(plan,candidate).allowed is False
