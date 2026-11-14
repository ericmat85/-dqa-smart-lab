"""Bounded synthetic scheduling evidence. No storage writes or model decisions."""
import hashlib
import itertools
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from gateway.e4_preview_provider import E4Error
from gateway.trial_rules import PROFILES, resolve_case, machine_matches, machine_evidence, execution, operation_buffers_allowed

CATALOG = json.loads(Path(__file__).with_name('e2_demo_catalog.json').read_text())
CASES = {x['id']: x for x in CATALOG['cases']}
EQUIPMENT = {x['id']: x for x in CATALOG['equipment']}
TAIPEI = timezone(timedelta(hours=8))


def fingerprint(value):
    def numbers(x):
        if isinstance(x,dict):return {k:numbers(v) for k,v in x.items()}
        if isinstance(x,list):return [numbers(v) for v in x]
        return int(x) if isinstance(x,float) and x.is_integer() else x
    return hashlib.sha256(json.dumps(numbers(value), sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


class Strict(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid', allow_inf_nan=False)


class Conditions(Strict):
    temperature_min: float | None = Field(ge=-273.15,le=1000,multiple_of=.001)
    temperature_max: float | None = Field(ge=-273.15,le=1000,multiple_of=.001)
    humidity_min: float | None = Field(ge=0,le=100,multiple_of=.001)
    humidity_max: float | None = Field(ge=0,le=100,multiple_of=.001)
    frequency_min: float | None = Field(default=None,gt=0,le=100000)
    frequency_max: float | None = Field(default=None,gt=0,le=100000)


class Trial(Strict):
    id: str = Field(min_length=1, max_length=80)
    status: Literal['UNSCHEDULED', 'CONFLICT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'PENDING_APPROVAL']
    quantity: int | None = Field(ge=1, le=1000)
    equipment_count: int = Field(ge=1, le=4)
    sample_volume_litres: float | None = Field(ge=.01, le=1000,multiple_of=.001)
    sample_space_units: int | None = Field(default=None,ge=1,le=1000)
    earliest: str | None = Field(max_length=10)
    deadline: str | None = Field(max_length=10)
    duration_days: int | None = Field(ge=1, le=14)
    preparation_minutes: int = Field(ge=0, le=1440)
    cleanup_minutes: int = Field(ge=0, le=1440)
    preferred_equipment_ids: list[str] = Field(max_length=4)
    conditions: Conditions
    profile_id: str | None = Field(default=None,max_length=80)
    duration_hours: float | None = Field(default=None,gt=0,le=24000)
    test_title: str | None = Field(default=None,max_length=80)


class Machine(Strict):
    id: str = Field(max_length=30)
    status: Literal['STANDBY', 'IN_USE', 'MAINTENANCE', 'CALIBRATION']


class Person(Strict):
    id: str = Field(max_length=80)
    enabled: bool


class Reservation(Strict):
    id: str = Field(min_length=1, max_length=80)
    equipment_ids: list[str] = Field(min_length=1, max_length=4)
    owner_id: str = Field(min_length=1, max_length=80)
    start_ms: int = Field(ge=0)
    end_ms: int | None = Field(ge=0)
    open_ended: bool


class Context(Strict):
    version: Literal[1]
    source: Literal['BROWSER_SYNTHETIC_SCHEDULE_V1']
    observed_at: int
    equipment_complete: bool
    personnel_complete: bool
    reservations_complete: bool
    request: Trial
    equipment: list[Machine] = Field(max_length=24)
    personnel: list[Person] = Field(max_length=30)
    reservations: list[Reservation] = Field(max_length=32)
    @field_validator('version',mode='before')
    @classmethod
    def version_integer(cls,value):
        if type(value) is not int or value!=1:raise ValueError('VERSION_REQUIRED')
        return value


class E2Advice(Strict):
    synthetic: Literal[True]
    question: Literal['CHECK_SYNTHETIC_SCHEDULE']
    schedule_context: Context
    @field_validator('synthetic',mode='before')
    @classmethod
    def synthetic_boolean(cls,value):
        if type(value) is not bool or value is not True:raise ValueError('SYNTHETIC_REQUIRED')
        return value


def validate_context(raw, now):
    try:
        c = Context.model_validate(raw).model_dump(exclude_unset=True)
    except Exception:
        raise E4Error('E2_INVALID_SYNTHETIC_CONTEXT', 422) from None
    if not now * 1000 - 300000 <= c['observed_at'] <= now * 1000 + 10000:
        raise E4Error('E2_CONTEXT_EXPIRED', 422)
    case=resolve_case(c['request'],CASES)
    if case is None:
        raise E4Error('E2_UNVERIFIED_SYNTHETIC_CASE', 422)
    profile_id=c['request'].get('profile_id')
    if not profile_id and (c['request'].get('duration_hours') is not None or c['request'].get('test_title') is not None or any(c['request']['conditions'].get(k) is not None for k in ('frequency_min','frequency_max'))):raise E4Error('E2_TRIAL_PROFILE_REQUIRED',422)
    if profile_id:
        profile=PROFILES.get(profile_id)
        if not profile or case.get('profile_id')!=profile_id:raise E4Error('E2_TRIAL_PROFILE_MISMATCH',422)
        if c['request'].get('test_title') is not None and c['request']['test_title']!=case['title']:raise E4Error('E2_TRIAL_PROFILE_MISMATCH',422)
        hours=c['request'].get('duration_hours')
        if hours is None or profile['fixed_duration'] and hours!=profile['hours']:raise E4Error('E2_TRIAL_HOURS_MISMATCH',422)
    for name, allow in [('equipment', EQUIPMENT), ('personnel', set(CATALOG['executors']) | {'U001','U002','U004','DEMO-REQUESTER','DEMO-SUPERVISOR','DEMO-LEVEL1','DEMO-LEVEL2','DEMO-LEVEL3'})]:
        ids = [x['id'] for x in c[name]]
        if len(set(ids)) != len(ids) or any(x not in allow for x in ids):
            raise E4Error('E2_UNVERIFIED_OR_DUPLICATE_RESOURCE', 422)
    preferred = c['request']['preferred_equipment_ids']
    if c['equipment_complete'] and {x['id'] for x in c['equipment']} != set(EQUIPMENT):
        raise E4Error('E2_INCOMPLETE_EQUIPMENT_SET', 422)
    if len(set(preferred)) != len(preferred) or any(x not in EQUIPMENT for x in preferred):
        raise E4Error('E2_INVALID_EQUIPMENT_SELECTION', 422)
    ids = [x['id'] for x in c['reservations']]
    if len(set(ids)) != len(ids):
        raise E4Error('E2_DUPLICATE_RESERVATION', 422)
    for x in c['reservations']:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', x['id']) or any(i not in EQUIPMENT for i in x['equipment_ids']) or len(set(x['equipment_ids'])) != len(x['equipment_ids']) or x['owner_id'] not in CATALOG['executors']:
            raise E4Error('E2_UNVERIFIED_RESERVATION_RESOURCE', 422)
        if x['open_ended'] != (x['end_ms'] is None) or (x['end_ms'] is not None and x['end_ms'] <= x['start_ms']):
            raise E4Error('E2_INVALID_RESERVATION_INTERVAL', 422)
    return c


def parse_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'20\d{2}-\d{2}-\d{2}', value):
        raise ValueError('INVALID_DATE')
    d = datetime.strptime(value, '%Y-%m-%d').replace(tzinfo=TAIPEI)
    if d.strftime('%Y-%m-%d') != value:
        raise ValueError('INVALID_DATE')
    return d


def capacity(machine, case, request):
    """Use documented synthetic geometry, count, mass and volume independently."""
    profile=PROFILES.get(request.get('profile_id'))
    e = machine_evidence(machine) if profile else machine['evidence']
    if not e:
        return None, 'MACHINE_CAPACITY_EVIDENCE_MISSING'
    condition = request['conditions']
    humidity_required=(profile['family'] if profile else case['family'])=='TEMPERATURE_HUMIDITY' or any(condition[x] is not None for x in ['humidity_min','humidity_max'])
    thermal_required=profile is None or any(x in profile['conditions'] for x in ('temperatureMin','temperatureMax')) or any(condition[x] is not None for x in ('temperature_min','temperature_max'))
    for name in [*(['temperature'] if thermal_required else []), *(['humidity'] if humidity_required else []), *(['frequency'] if profile and 'frequencyMin' in profile['conditions'] else [])]:
        low, high = condition.get(name + '_min'), condition.get(name + '_max')
        if low is None or high is None:
            return None, 'TEST_CONDITIONS_INCOMPLETE'
        if low > high:
            raise E4Error('E2_INVALID_CONDITION_RANGE', 422)
        limit = e.get(name)
        if limit is None:
            return None, 'MACHINE_CONDITION_EVIDENCE_MISSING'
        if low < limit[0] or high > limit[1]:
            return 0, 'CONDITION_OUTSIDE_DOCUMENTED_RANGE'
    sample = case['sample']
    bounding_litres = math.prod(sample['dimensions_mm']) / 1000000
    if request['sample_volume_litres'] < bounding_litres:
        return None, 'SAMPLE_VOLUME_BELOW_DOCUMENTED_ENVELOPE'
    spacing = sample['clearance_mm']
    grid = max(math.prod(math.floor((d + spacing) / (s + spacing)) for d, s in zip(e['inner_mm'], shape)) for shape in itertools.permutations(sample['dimensions_mm']))
    chamber_litres = math.prod(e['inner_mm']) / 1000000
    bound = min(e['max_samples'], grid, math.floor(chamber_litres / request['sample_volume_litres']), math.floor(e['max_load_kg'] / sample['mass_kg']))
    if 'sample_space_units' in request:
        if request['sample_space_units'] is None:return None, 'SAMPLE_SPACE_UNITS_REQUIRED'
        units=machine.get('space_units')
        if type(units) is not int or units<1:return None, 'MACHINE_SPACE_UNITS_EVIDENCE_MISSING'
        bound=min(bound,units//request['sample_space_units'])
    if profile and profile['id']=='VIBRATION_DURABILITY':bound=min(1,bound)
    return bound, 'DOCUMENTED_SYNTHETIC_GEOMETRY_COUNT_AND_LOAD'


def evaluate(raw, now):
    c = validate_context(raw, now)
    if c['request'].get('profile_id'):return evaluate_profile(c,now)
    req = c['request'];case = CASES[req['id']]
    result = {'status': 'UNKNOWN', 'reasons': [], 'candidates': [], 'context_fingerprint': fingerprint(c), 'synthetic': True, 'capacity_source': 'SYNTHETIC_DIMENSION_DOCUMENTS', 'planning_scope': 'STANDBY_EQUIPMENT_ONLY_BOUNDED_WINDOW', 'writes': 'NONE', 'requires_confirmation': True}
    def missing(*codes):
        result['reasons'] = list(dict.fromkeys(codes));return result
    if req['status'] not in ['UNSCHEDULED','CONFLICT','SCHEDULED']:
        return missing('TRIAL_STATE_NOT_SCHEDULABLE')
    if not all(c[x + '_complete'] for x in ['equipment','personnel','reservations']):
        return missing('RESOURCE_OR_RESERVATION_COVERAGE_INCOMPLETE')
    if req['quantity'] is None or req['sample_volume_litres'] is None:
        return missing('SAMPLE_QUANTITY_OR_VOLUME_REQUIRED')
    if 'sample_space_units' in req and req['sample_space_units'] is None:
        return missing('SAMPLE_SPACE_UNITS_REQUIRED')
    if req['duration_days'] is None or req['earliest'] is None or req['deadline'] is None:
        return missing('DURATION_AND_SEARCH_DATES_REQUIRED')
    if case['family'] == 'UNVERIFIED_CONDITIONS':
        return missing('TEST_TYPE_CONDITION_EVIDENCE_MISSING')
    humidity_required=case['family']=='TEMPERATURE_HUMIDITY' or any(req['conditions'][x] is not None for x in ['humidity_min','humidity_max'])
    if any(req['conditions'][name + suffix] is None for name in ['temperature', *(['humidity'] if humidity_required else [])] for suffix in ['_min','_max']):
        return missing('TEST_CONDITIONS_INCOMPLETE')
    try:
        start, deadline = parse_date(req['earliest']), parse_date(req['deadline'])
    except ValueError:
        raise E4Error('E2_INVALID_SEARCH_DATE', 422) from None
    today = datetime.fromtimestamp(now, TAIPEI).date()
    if start.date() <= today or deadline < start:
        raise E4Error('E2_INVALID_SEARCH_WINDOW', 422)
    window_end = min(deadline, start + timedelta(days=CATALOG['limits']['horizon_days'] - 1))
    owners = [x['id'] for x in c['personnel'] if x['enabled'] and x['id'] in CATALOG['executors']]
    if not owners:
        return missing('ENABLED_ENGINEER_REQUIRED')
    available = [];uncertain = [];rejected = []
    for m in c['equipment']:
        machine = EQUIPMENT[m['id']]
        if m['status'] != 'STANDBY':
            continue
        thermal = bool(re.search('環境試驗箱|恆溫恆濕|高溫爐', machine['name']))
        if not thermal or case['family']=='TEMPERATURE_HUMIDITY' and '恆溫恆濕' not in machine['name']:
            continue
        n, code = capacity(machine, case, req)
        if n is None:
            uncertain.append(code)
        elif n < 1:
            rejected.append(code)
        else:
            available.append((machine, n))
    preferred = req['preferred_equipment_ids']
    available.sort(key=lambda x: (x[0]['id'] not in preferred, -x[1], x[0]['id']))
    work = 0
    for offset in range(CATALOG['limits']['horizon_days']):
        date = start + timedelta(days=offset);end = date + timedelta(days=req['duration_days'] - 1)
        if end > window_end:
            break
        begin_ms = int(date.timestamp()*1000) - req['preparation_minutes']*60000
        finish_ms = int((end+timedelta(days=1)).timestamp()*1000) + req['cleanup_minutes']*60000
        for selected in itertools.combinations(available, req['equipment_count']):
            if req['quantity'] < len(selected) or sum(n for _, n in selected) < req['quantity']:
                continue
            equipment_ids = [m['id'] for m, _ in selected]
            for owner in owners:
                work += 1
                if work > 20000:
                    return missing('SEARCH_LIMIT_REACHED')
                conflicts = [r for r in c['reservations'] if r['id']!=req['id'] and begin_ms < (r['end_ms'] if r['end_ms'] is not None else math.inf) and r['start_ms'] < finish_ms and (r['owner_id']==owner or set(r['equipment_ids']) & set(equipment_ids))]
                if conflicts:
                    continue
                remaining = req['quantity'];allocations = []
                for i, (m, n) in enumerate(selected):
                    count = min(n, remaining - (len(selected)-i-1));remaining -= count
                    allocations.append({'equipment_id':m['id'],'quantity':count,'capacity':n,'evidence_id':m['evidence']['id']})
                candidate = {'equipment_ids':equipment_ids,'owner_id':owner,'start':date.date().isoformat(),'end':end.date().isoformat(),'allocations':allocations,'sample_evidence_id':case['sample']['evidence_id']}
                candidate['id'] = 'P-' + fingerprint(candidate)[:20]
                result['candidates'].append(candidate)
                if len(result['candidates']) == 3:
                    result.update(status='PROPOSAL_AVAILABLE', reasons=[]);return result
    if result['candidates']:
        result.update(status='PROPOSAL_AVAILABLE', reasons=[]);return result
    if uncertain:
        return missing(*uncertain)
    result.update(status='INFEASIBLE_IN_WINDOW', reasons=list(dict.fromkeys(rejected + ['NO_SLOT_WITHIN_VERIFIED_DEMO_WINDOW'])))
    return result


def evaluate_profile(c, now):
    """Profile hours, machine fit and weekday operations remain server-owned."""
    req=c['request'];case=resolve_case(req,CASES);profile=PROFILES[req['profile_id']]
    result={'status':'UNKNOWN','reasons':[],'candidates':[],'context_fingerprint':fingerprint(c),'synthetic':True,'capacity_source':'SYNTHETIC_DIMENSION_DOCUMENTS','planning_scope':'STANDBY_EQUIPMENT_ONLY_BOUNDED_WINDOW','writes':'NONE','requires_confirmation':True,'profile_id':profile['id'],'case_basis':'DECLARED_SYNTHETIC_TEMPLATE' if case.get('template') else 'REGISTERED_SYNTHETIC_CASE'}
    def missing(*codes):result['reasons']=list(dict.fromkeys(codes));return result
    if req['status'] not in ['UNSCHEDULED','CONFLICT','SCHEDULED']:return missing('TRIAL_STATE_NOT_SCHEDULABLE')
    if not all(c[k+'_complete'] for k in ('equipment','personnel','reservations')):return missing('RESOURCE_OR_RESERVATION_COVERAGE_INCOMPLETE')
    if req['quantity'] is None or req['sample_volume_litres'] is None:return missing('SAMPLE_QUANTITY_OR_VOLUME_REQUIRED')
    if 'sample_space_units' in req and req['sample_space_units'] is None:return missing('SAMPLE_SPACE_UNITS_REQUIRED')
    if not req['earliest'] or not req['deadline']:return missing('DURATION_AND_SEARCH_DATES_REQUIRED')
    try:start,deadline=parse_date(req['earliest']),parse_date(req['deadline'])
    except ValueError:raise E4Error('E2_INVALID_SEARCH_DATE',422) from None
    if start.date()<=datetime.fromtimestamp(now,TAIPEI).date() or deadline<start:raise E4Error('E2_INVALID_SEARCH_WINDOW',422)
    window_end=min(deadline,start+timedelta(days=CATALOG['limits']['horizon_days']-1))
    owners=[p['id'] for p in c['personnel'] if p['enabled'] and p['id'] in CATALOG['executors']]
    if not owners:return missing('ENABLED_ENGINEER_REQUIRED')
    available=[];uncertain=[];rejected=[];matching=False
    for row in c['equipment']:
        machine=EQUIPMENT[row['id']]
        if not machine_matches(profile,machine):continue
        matching=True
        if row['status']!='STANDBY':continue
        count,code=capacity(machine,case,req)
        if count is None:uncertain.append(code)
        elif count<1:rejected.append(code)
        else:available.append((machine,count))
    if not matching:return missing('MATCHING_EQUIPMENT_NOT_REGISTERED')
    available.sort(key=lambda item:(item[0]['id'] not in req['preferred_equipment_ids'],-item[1],item[0]['id']))
    work=0
    for offset in range(CATALOG['limits']['horizon_days']):
        date=start+timedelta(days=offset)
        if date>window_end:break
        if profile['calendar']=='weekdays' and date.weekday()>=5:continue
        for selected in itertools.combinations(available,req['equipment_count']):
            if req['quantity']<len(selected):continue
            if profile['mode']=='batch' and sum(n for _,n in selected)<req['quantity']:continue
            remaining=req['quantity'];allocations=[]
            for i,(machine,count) in enumerate(selected):
                quantity=math.ceil(remaining/(len(selected)-i)) if profile['mode']=='serial' else min(count,remaining-(len(selected)-i-1));remaining-=quantity
                allocations.append({'equipment_id':machine['id'],'quantity':quantity,'capacity':count,'evidence_id':machine_evidence(machine)['id']})
            if profile['mode']=='serial':
                days=sum(1 for n in range((window_end-date).days+1) if profile['calendar']!='weekdays' or (date+timedelta(days=n)).weekday()<5)
                if any(a['quantity']>a['capacity']*math.floor(profile['daily_hours']/req['duration_hours'])*days for a in allocations):continue
            try:plan=execution(profile,date.date().isoformat(),allocations,req['duration_hours'])
            except ValueError:continue
            if not operation_buffers_allowed(plan,req['preparation_minutes'],req['cleanup_minutes']):continue
            if plan['end_date']>window_end.date().isoformat():continue
            begin=plan['start_ms']-req['preparation_minutes']*60000;finish=plan['end_ms']+req['cleanup_minutes']*60000;ids=[m['id'] for m,_ in selected]
            for owner in owners:
                work+=1
                if work>20000:return missing('SEARCH_LIMIT_REACHED')
                if any(r['id']!=req['id'] and begin<(r['end_ms'] if r['end_ms'] is not None else math.inf) and r['start_ms']<finish and (r['owner_id']==owner or set(r['equipment_ids'])&set(ids)) for r in c['reservations']):continue
                candidate={'equipment_ids':ids,'owner_id':owner,'start':date.date().isoformat(),'end':plan['end_date'],'allocations':allocations,'sample_evidence_id':case['sample']['evidence_id']}
                candidate['id']='P-'+fingerprint(candidate)[:20];result['candidates'].append(candidate)
                if len(result['candidates'])==3:result.update(status='PROPOSAL_AVAILABLE',reasons=[]);return result
    if result['candidates']:result.update(status='PROPOSAL_AVAILABLE',reasons=[]);return result
    if uncertain:return missing(*uncertain)
    result.update(status='INFEASIBLE_IN_WINDOW',reasons=list(dict.fromkeys(rejected+['NO_SLOT_WITHIN_VERIFIED_DEMO_WINDOW'])));return result
