"""Shared synthetic trial profiles. No inference, writes, or real-world claims."""
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = json.loads(Path(__file__).with_name('trial_profiles.json').read_text())
PROFILES = {p['id']: p for p in DATA['profiles']}
TAIPEI = timezone(timedelta(hours=8))
HOUR = 3600000


def profile_for_title(title):
    if re.search('[、,，;]', title):
        return None
    return next((p for p in PROFILES.values() if re.search(p['match'], title, re.I)), None)


def machine_matches(profile, machine):
    return bool(re.search(profile['equipment_pattern'], machine['name'], re.I))


def machine_evidence(machine):
    return machine.get('evidence') or DATA['machine_evidence'].get(machine['id'])


def operation_buffers_allowed(plan, preparation=0, cleanup=0):
    if plan['calendar']!='weekdays':return True
    for begin,end in ((plan['start_ms']-preparation*60000,plan['start_ms']),(plan['end_ms'],plan['end_ms']+cleanup*60000)):
        at=begin
        while at<end:
            date=datetime.fromtimestamp(at/1000,TAIPEI)
            if date.weekday()>=5:return False
            at=min(end,int((date.replace(hour=0,minute=0,second=0,microsecond=0)+timedelta(days=1)).timestamp()*1000))
    return True


def resolve_case(request, cases):
    case = cases.get(request['id'])
    if case:
        return case
    profile = PROFILES.get(request.get('profile_id'))
    title = request.get('test_title')
    if profile and title in profile['aliases'] and re.fullmatch('SCH-REQ-2026-[a-f0-9]{8}', request['id']):
        return {'id': request['id'], 'title': title, 'profile_id': profile['id'], 'family': profile['family'], 'sample': profile['sample'], 'template': True}
    return None


def execution(profile, start, allocations, hours=None):
    hours = profile['hours'] if hours is None else hours
    beginning = datetime.strptime(start, '%Y-%m-%d').replace(tzinfo=TAIPEI)
    if not math.isfinite(hours) or not 0 < hours <= 24000 or not 1 <= len(allocations) <= 4:
        raise ValueError('TRIAL_EXECUTION_DATA_REQUIRED')
    if profile['fixed_duration'] and hours != profile['hours']:
        raise ValueError('FIXED_TRIAL_HOURS_REQUIRED')
    if profile['calendar'] == 'weekdays' and beginning.weekday() >= 5:
        raise ValueError('OPERATION_WEEKDAY_START_REQUIRED')
    segments, dates, seen = [], set(), set()
    for a in allocations:
        ident = a['equipment_id']
        if ident in seen or type(a['quantity']) is not int or not 1 <= a['quantity'] <= 1000 or type(a['capacity']) is not int or a['capacity'] < 1:
            raise ValueError('TRIAL_ALLOCATION_INVALID')
        seen.add(ident)
        if profile['mode'] == 'batch':
            if a['quantity'] > a['capacity']:
                raise ValueError('BATCH_CAPACITY_EXCEEDED')
            segments.append({'equipment_id': ident, 'quantity': a['quantity'], 'start_ms': int(beginning.timestamp()*1000), 'end_ms': int(beginning.timestamp()*1000 + hours*HOUR)})
            dates.add(start)
            continue
        if hours > profile['daily_hours']:
            raise ValueError('OPERATION_EXCEEDS_DAILY_HOURS')
        capacity = 1 if profile['id'] == 'VIBRATION_DURABILITY' else a['capacity']
        remaining, offset = a['quantity'], 0
        while remaining:
            if offset > 2048 or len(segments) > 4000:
                raise ValueError('TRIAL_PLANNING_LIMIT')
            date = beginning + timedelta(days=offset)
            offset += 1
            if profile['calendar'] == 'weekdays' and date.weekday() >= 5:
                continue
            used = 0
            while remaining and used + hours <= profile['daily_hours']:
                quantity = min(capacity, remaining)
                begin = int(date.timestamp()*1000 + used*HOUR)
                segments.append({'equipment_id': ident, 'quantity': quantity, 'start_ms': begin, 'end_ms': int(begin + hours*HOUR)})
                remaining -= quantity
                dates.add(date.date().isoformat())
                used += hours
    end = max(s['end_ms'] for s in segments)
    return {'version': 1, 'profile_id': profile['id'], 'calendar': profile['calendar'], 'hours_per_batch': hours, 'start_ms': min(s['start_ms'] for s in segments), 'end_ms': end, 'end_date': datetime.fromtimestamp((end-1)/1000, TAIPEI).date().isoformat(), 'working_dates': sorted(dates), 'total_sample_hours': sum((s['end_ms']-s['start_ms'])/HOUR*s['quantity'] for s in segments), 'segments': segments, 'synthetic': True, 'official_standard': False}
