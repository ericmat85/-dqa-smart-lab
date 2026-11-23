"""Adversarial offline evidence and pending-policy checks."""
import ast
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
import socket
from uuid import UUID
import pytest
from pydantic import ValidationError
from app.core.errors import RuleNotApprovedError
from app.scheduling.constraints import UNAPPROVED_INTENTS
from app.scheduling.evaluator import SchedulingEvaluator, evaluate_candidate, require_schedulable_commit
from .conftest import NOW, updated, window, conditions, assess, existing


@pytest.mark.parametrize('intent',sorted(UNAPPROVED_INTENTS|{'unknown_business_action'}))
def test_all_pending_rules_default_deny(plan,intent):
    assert assess(plan,updated(plan.candidate,intent=intent)).decision_code=='RULE_NOT_APPROVED'


@pytest.mark.parametrize('status',['running','paused','interrupted','held','completed','cancelled','unknown'])
def test_ended_reservation_does_not_prove_release(plan,status):
    row=updated(existing(plan),status=status,start_time=NOW-timedelta(hours=2),end_time=NOW-timedelta(hours=1))
    assert assess(plan,snapshot=updated(plan.snapshot,reservations=(row,))).decision_code=='RULE_NOT_APPROVED'


def test_compatible_sharing_not_implicitly_approved(plan):
    other=existing(plan,engineer_id=UUID(int=999))
    decision=assess(plan,snapshot=updated(plan.snapshot,reservations=(other,)))
    assert decision.decision_code=='TIME_CONFLICT'
    assert 'CAPACITY_EXCEEDED' not in decision.conflict_codes
    assert assess(plan,updated(plan.candidate,intent='share_equipment')).decision_code=='RULE_NOT_APPROVED'


def test_shared_environment_conflict(plan):
    other=existing(plan,engineer_id=UUID(int=999),conditions=conditions('35','50'))
    assert 'ENVIRONMENT_INCOMPATIBLE' in assess(plan,snapshot=updated(plan.snapshot,reservations=(other,))).conflict_codes


def test_cumulative_capacity_not_just_pairwise(plan):
    first=existing(plan,engineer_id=UUID(int=998))
    second=updated(first,reservation_id=UUID(int=603),engineer_id=UUID(int=999))
    assert 'CAPACITY_EXCEEDED' in assess(plan,snapshot=updated(plan.snapshot,reservations=(first,second))).conflict_codes


def test_disjoint_load_not_summed_as_simultaneous(plan):
    machine=updated(plan.equipment,preparation_time=timedelta(0),transition_time=timedelta(0),cleanup_time=timedelta(0))
    first=existing(plan,engineer_id=UUID(int=998),end_time=plan.row.start_time+timedelta(minutes=30))
    second=updated(first,reservation_id=UUID(int=603),start_time=first.end_time,end_time=plan.row.end_time)
    decision=assess(plan,snapshot=updated(plan.snapshot,equipment=(machine,),reservations=(first,second)))
    assert 'TIME_CONFLICT' in decision.conflict_codes
    assert 'CAPACITY_EXCEEDED' not in decision.conflict_codes


def test_engineer_assigned_work(plan):
    engineer=updated(plan.engineer,assigned_work=(window(plan.row.start_time,plan.row.end_time),))
    assert assess(plan,snapshot=updated(plan.snapshot,engineers=(engineer,))).decision_code=='TIME_CONFLICT'


def test_qualification_must_cover_buffers(plan):
    qualification=updated(plan.engineer.qualifications[0],valid_until=plan.row.end_time)
    snapshot=updated(plan.snapshot,engineers=(updated(plan.engineer,qualifications=(qualification,)),))
    assert assess(plan,snapshot=snapshot).decision_code=='ENGINEER_UNQUALIFIED'


@pytest.mark.parametrize('change',[{'valid_until':NOW},{'as_of':NOW+timedelta(seconds=1)}])
def test_stale_or_future_snapshot(plan,change):
    assert assess(plan,snapshot=updated(plan.snapshot,**change)).decision_code=='STALE_SNAPSHOT'


def test_incomplete_snapshot_not_silently_empty(plan):
    snapshot=updated(plan.snapshot,complete_evidence=plan.snapshot.complete_evidence-{'maintenance'})
    assert assess(plan,snapshot=snapshot).required_evidence==('COMPLETE_MAINTENANCE',)


def test_horizon_covers_full_buffered_candidate(plan):
    snapshot=updated(plan.snapshot,horizon=window(plan.row.start_time,plan.row.end_time))
    assert assess(plan,snapshot=snapshot).decision_code=='MISSING_REQUIRED_DATA'


@pytest.mark.parametrize('field',['preparation_time','transition_time','cleanup_time'])
def test_unknown_buffer_never_defaults_zero(plan,field):
    snapshot=updated(plan.snapshot,equipment=(updated(plan.equipment,**{field:None}),))
    assert assess(plan,snapshot=snapshot).decision_code=='MISSING_REQUIRED_DATA'


@pytest.mark.parametrize('field,value',[('reserved_capacity',1),('reserved_space',Decimal('1')),('reserved_channels',0)])
def test_ai_understated_demands(plan,field,value):
    candidate=updated(plan.candidate,source='ai',proposed_reservations=(updated(plan.row,**{field:value}),))
    assert assess(plan,candidate).decision_code=='MISSING_REQUIRED_DATA'


def test_ai_cannot_change_trusted_conditions(plan):
    row=updated(plan.row,conditions=conditions('30','50'))
    assert assess(plan,updated(plan.candidate,source='ai',proposed_reservations=(row,))).decision_code=='ENVIRONMENT_INCOMPATIBLE'


def test_ai_source_is_not_authority(plan):
    assert assess(plan,updated(plan.candidate,source='ai'))==assess(plan,updated(plan.candidate,source='manual'))


def test_multidevice_count_and_allocations(plan):
    equipment2=updated(plan.equipment,equipment_id=UUID(int=101))
    engineer2=updated(plan.engineer,engineer_id=UUID(int=201))
    a,b=plan.snapshot.samples
    first=updated(plan.row,sample_ids=frozenset({a.sample_id}),reserved_capacity=1,reserved_space=a.required_space,reserved_channels=a.required_channels)
    second=updated(first,reservation_id=UUID(int=501),sample_ids=frozenset({b.sample_id}),equipment_id=equipment2.equipment_id,engineer_id=engineer2.engineer_id)
    snapshot=updated(plan.snapshot,equipment=(plan.equipment,equipment2),engineers=(plan.engineer,engineer2),requirements=(updated(plan.requirement,equipment_count=2),))
    candidate=updated(plan.candidate,proposed_reservations=(first,second))
    assert assess(plan,candidate,snapshot).allowed
    assert not assess(plan,candidate).allowed
    duplicate=updated(second,sample_ids=first.sample_ids)
    assert assess(plan,updated(candidate,proposed_reservations=(first,duplicate)),snapshot).decision_code=='MISSING_REQUIRED_DATA'
    same_engineer=updated(second,engineer_id=first.engineer_id)
    assert assess(plan,updated(candidate,proposed_reservations=(first,same_engineer)),snapshot).decision_code=='TIME_CONFLICT'


def test_unknown_sample_or_requirement(plan):
    assert assess(plan,snapshot=updated(plan.snapshot,samples=())).decision_code=='MISSING_REQUIRED_DATA'
    assert assess(plan,snapshot=updated(plan.snapshot,requirements=())).decision_code=='MISSING_REQUIRED_DATA'


def test_mixed_tenant_never_accepted(plan):
    row=updated(plan.row,tenant_id=UUID(int=2))
    assert not assess(plan,updated(plan.candidate,proposed_reservations=(row,))).allowed
    with pytest.raises(ValidationError): updated(plan.snapshot,equipment=(updated(plan.equipment,tenant_id=UUID(int=2)),))


def test_duplicate_trusted_resource_ids(plan):
    with pytest.raises(ValidationError): updated(plan.snapshot,equipment=(plan.equipment,plan.equipment))


def test_no_implicit_edit_of_existing_reservation(plan):
    assert assess(plan,snapshot=updated(plan.snapshot,reservations=(updated(plan.row,status='planned'),))).decision_code=='RULE_NOT_APPROVED'


def test_unvalidated_model_copy_is_revalidated(plan):
    candidate=plan.candidate.model_copy(update={'proposed_reservations':(plan.row.model_copy(update={'reserved_capacity':-1}),)})
    assert assess(plan,candidate).decision_code=='MISSING_REQUIRED_DATA'
    assert evaluate_candidate({},plan.snapshot,evaluated_at=NOW).allowed is False


@pytest.mark.parametrize('field,value',[('required_space',Decimal('NaN')),('required_space',Decimal('Infinity')),
    ('required_space',Decimal('-1')),('required_space',Decimal('0')),('required_channels',-1)])
def test_invalid_sample_demands(plan,field,value):
    with pytest.raises(ValidationError): updated(plan.snapshot.samples[0],**{field:value})


def test_buffer_and_interval_validation(plan):
    with pytest.raises(ValidationError): updated(plan.equipment,cleanup_time=timedelta(seconds=-1))
    with pytest.raises(ValidationError): updated(plan.row,end_time=plan.row.start_time)
    with pytest.raises(ValidationError): updated(plan.row,end_time=plan.row.start_time-timedelta(seconds=1))


def test_snapshot_and_model_immutable(plan):
    with pytest.raises(ValidationError): plan.equipment.capacity=100
    with pytest.raises(ValidationError): updated(plan.snapshot,mode='PRODUCTION')
    with pytest.raises(ValidationError): updated(plan.row,space_unit='m3')


def test_explicit_clock_and_no_business_commit(plan):
    decision=SchedulingEvaluator(plan.clock).evaluate_candidate(plan.candidate,plan.snapshot)
    assert decision==assess(plan)
    with pytest.raises(ValueError): evaluate_candidate(plan.candidate,plan.snapshot,evaluated_at=NOW.replace(tzinfo=None))
    with pytest.raises(RuleNotApprovedError): require_schedulable_commit(decision)
    assert decision.side_effects_authorized is False


def test_no_assert_or_network_provider_in_scheduling():
    prohibited={'socket','requests','httpx','httpx2','supabase','openai','psycopg','sqlalchemy'}
    for path in Path('app/scheduling').glob('*.py'):
        nodes=list(ast.walk(ast.parse(path.read_text())))
        assert not any(isinstance(node,ast.Assert) for node in nodes)
        for node in nodes:
            names=[]
            if isinstance(node,ast.Import): names=[a.name for a in node.names]
            elif isinstance(node,ast.ImportFrom) and node.module: names=[node.module]
            assert not any(name.split('.')[0] in prohibited for name in names)


def test_network_guards_without_allocating_socket():
    for target in [('192.0.2.1',443),('2001:db8::1',443,0,0)]:
        for method in (socket.socket.connect,socket.socket.connect_ex,socket.socket.sendto):
            with pytest.raises(RuntimeError): method(object(),target)
    with pytest.raises(RuntimeError): socket.getaddrinfo('example.invalid',443)
    with pytest.raises(RuntimeError): socket.create_connection(('example.invalid',443))


@pytest.mark.parametrize('state',['already_scheduled','running','interrupted','completed','cancelled','unknown'])
def test_new_intent_cannot_hide_unapproved_lifecycle(plan,state):
    snapshot=updated(plan.snapshot,requirements=(updated(plan.requirement,scheduling_state=state),))
    assert assess(plan,snapshot=snapshot).decision_code=='RULE_NOT_APPROVED'


def test_new_id_cannot_hide_existing_trial_booking(plan):
    equipment2=updated(plan.equipment,equipment_id=UUID(int=101))
    other=updated(plan.row,reservation_id=UUID(int=605),equipment_id=equipment2.equipment_id,
        engineer_id=UUID(int=999),status='planned')
    snapshot=updated(plan.snapshot,equipment=(plan.equipment,equipment2),reservations=(other,))
    assert assess(plan,snapshot=snapshot).decision_code=='RULE_NOT_APPROVED'


@pytest.mark.parametrize('precision',[3,28,50])
def test_space_arithmetic_independent_of_decimal_context(plan,precision):
    from decimal import localcontext
    samples=tuple(updated(sample,required_space=Decimal('0.1234567890123456789012345678'))
                  for sample in plan.snapshot.samples)
    row=updated(plan.row,reserved_space=Decimal('0.2469135780246913578024691356'))
    snapshot=updated(plan.snapshot,samples=samples)
    with localcontext() as context:
        context.prec=precision
        assert assess(plan,updated(plan.candidate,proposed_reservations=(row,)),snapshot).allowed
