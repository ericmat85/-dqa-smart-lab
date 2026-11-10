"""Pure rule cores. Caller-supplied objects only; no storage, network or UI."""
from dataclasses import asdict
from datetime import timedelta
from itertools import combinations
from copy import deepcopy
from .models import required, require, number, integer, text, calendar_date, digest, SourceReference


def conditions(obj):
    required(obj, ('temperature_min','temperature_max','humidity_min','humidity_max'))
    for key,value in obj.items():
        require(key in ('temperature_min','temperature_max','humidity_min','humidity_max') and number(value), 'conditions.'+key)
    require(obj['temperature_min'] <= obj['temperature_max'], 'temperature_range')
    require(0 <= obj['humidity_min'] <= obj['humidity_max'] <= 100, 'humidity_range')
    return dict(obj)


def source(ref, refs):
    parsed = SourceReference.parse(ref)
    require(parsed in refs, 'source_ref', 'SOURCE_NOT_FOUND')
    return parsed


def review(p, refs):
    required(p, ('request','customer_spec','supervisor_endorsement','technical_review'))
    req = p['request']; required(req, ('product','date','quantity','conditions'))
    require(text(req['product']), 'product'); calendar_date(req['date'])
    require(integer(req['quantity']), 'quantity')
    trial = conditions(req['conditions'])
    spec = p['customer_spec']; required(spec, ('ref','conditions'))
    source(spec['ref'], refs); expected = conditions(spec['conditions'])
    require(isinstance(p['supervisor_endorsement'], dict), 'supervisor_endorsement')
    require(p['technical_review'] in ('PASS','FAIL','UNKNOWN'), 'technical_review')
    findings = [{'code':'SPEC_DEVIATION','field':k,'requested':trial[k],'reference':expected[k]} for k in trial if trial[k] != expected[k]]
    warnings = []
    if p['technical_review'] != 'PASS': warnings.append('HUMAN_TECHNICAL_REVIEW_NOT_PASSED')
    return {'structured_conditions':trial,'findings':findings,'recommendation':'REVIEW_REQUIRED' if findings or warnings else 'NO_RULE_DEVIATION','human_technical_review_status':p['technical_review'],'supervisor_endorsement':deepcopy(p['supervisor_endorsement'])}, warnings


def schedule(p, refs):
    required(p, ('trial_id','start_date','duration_days','granularity','conditions','samples','equipment','reservations','required_devices'))
    require(text(p['trial_id']), 'trial_id')
    start = calendar_date(p['start_date']); require(p['granularity']=='DAY','granularity')
    require(integer(p['duration_days']) and p['duration_days']<=3660,'duration_days')
    end = start + timedelta(days=p['duration_days']-1)
    trial = conditions(p['conditions'])
    required(p['samples'], ('count','volume_l'))
    count, volume = p['samples']['count'], p['samples']['volume_l']
    require(integer(count) and number(volume) and volume>0,'samples')
    # Preserve decimal input values exactly; no tolerance or capacity relaxation.
    from decimal import Decimal
    volume_num, volume_den = Decimal(str(volume)).as_integer_ratio()
    require(integer(p['required_devices']) and p['required_devices']<=4,'required_devices')
    require(isinstance(p['equipment'],list) and isinstance(p['reservations'],list),'resources')
    conflicts=[];eligible=[];seen=set()
    reservations=[]
    for row in p['reservations']:
        required(row, ('equipment_id','start_date','expected_end_date','pickup_confirmed'))
        rs=calendar_date(row['start_date']); re=calendar_date(row['expected_end_date'])
        require(rs<=re and type(row['pickup_confirmed']) is bool and text(row['equipment_id']),'reservation')
        # An actual pickup is separate from expected finish. Unconfirmed removal
        # blocks subsequent proposals; this core never confirms pickup itself.
        reservations.append((row,rs,re))
    for machine in p['equipment']:
        required(machine, ('id','safe','max_samples','usable_volume_l','conditions','ref'))
        require(text(machine['id']) and machine['id'] not in seen,'equipment.id');seen.add(machine['id'])
        source(machine['ref'], refs)
        require(type(machine['safe']) is bool and integer(machine['max_samples']) and number(machine['usable_volume_l']) and machine['usable_volume_l']>0,'equipment')
        limits=conditions(machine['conditions']); reason=None
        if not machine['safe']: reason='EQUIPMENT_UNSAFE'
        elif any(trial[k]<limits[k] if k.endswith('_min') else trial[k]>limits[k] for k in trial): reason='CONDITIONS_INCOMPATIBLE'
        elif any(row['equipment_id']==machine['id'] and start<=re and rs<=end for row,rs,re in reservations): reason='DATE_CONFLICT'
        elif any(row['equipment_id']==machine['id'] and not row['pickup_confirmed'] and start>re for row,rs,re in reservations): reason='AWAITING_ACTUAL_PICKUP'
        if reason: conflicts.append({'equipment_id':machine['id'],'reason':reason});continue
        usable_num, usable_den = Decimal(str(machine['usable_volume_l'])).as_integer_ratio()
        capacity=min(machine['max_samples'],(usable_num*volume_den)//(usable_den*volume_num))
        eligible.append((machine,capacity))
    proposals=[];needed=p['required_devices']
    if len(eligible)<needed: conflicts.append({'equipment_id':None,'reason':'INSUFFICIENT_EQUIPMENT'})
    else:
        for group in combinations(eligible,needed):
            if count<needed or any(cap<1 for _,cap in group) or sum(cap for _,cap in group)<count:
                conflicts.append({'equipment_id':','.join(m['id'] for m,_ in group),'reason':'SAMPLE_CAPACITY_OR_VOLUME_EXCEEDED'});continue
            remaining=count; allocations=[]
            for index,(machine,cap) in enumerate(group):
                n=min(cap, remaining-(len(group)-index-1))
                if n<1:break
                allocations.append({'equipment_id':machine['id'],'sample_count':n});remaining-=n
            if remaining:continue
            proposals.append({'trial_id':p['trial_id'],'granularity':'DAY','start_date':start.isoformat(),'expected_end_date':end.isoformat(),'allocations':allocations,'requires_actual_pickup_confirmation':True,'applied':False})
            # Bounded advisory list; no optimization claim.
            if len(proposals)==10:break
    return {'proposals':proposals,'conflicts':conflicts,'applied':False}, [] if proposals else ['NO_FEASIBLE_PROPOSAL']


def report(p, refs):
    required(p, ('raw_data_ref','raw_data_digest','measurements','template_ref','required_fields','original_result'))
    ref=source(p['raw_data_ref'],refs);source(p['template_ref'],refs)
    require(isinstance(p['measurements'],list) and bool(p['measurements']),'measurements','MISSING_REQUIRED_FIELD')
    require(isinstance(p['required_fields'],dict),'required_fields')
    required(p['required_fields'], ('report_id','trial_id','title'))
    require(all(text(p['required_fields'][k]) for k in ('report_id','trial_id','title')),'report_fields')
    require(p['original_result'] in ('PASS','FAIL','UNDETERMINED'),'original_result')
    warnings=[];names=set();checks=[]
    for row in p['measurements']:
        required(row, ('name','value','unit','min','max'))
        require(text(row['name']) and row['name'] not in names and text(row['unit']),'measurement_identity');names.add(row['name'])
        require(all(number(row[k]) for k in ('value','min','max')) and row['min']<=row['max'],'measurement_values')
        within=row['min']<=row['value']<=row['max'];checks.append({'name':row['name'],'within_declared_limits':within})
        if not within:warnings.append('OUTSIDE_DECLARED_LIMITS:'+row['name'])
    require(p['raw_data_digest']==digest(p['measurements'])==ref.digest,'raw_data_digest')
    if warnings and p['original_result']=='PASS':warnings.append('DECLARED_RESULT_REQUIRES_HUMAN_REVIEW')
    return {'draft_data':{'fields':deepcopy(p['required_fields']),'measurements':deepcopy(p['measurements']),'original_result':p['original_result']},'checks':checks,'raw_data_digest':p['raw_data_digest'],'review_status':'PENDING_HUMAN','suggestions':warnings.copy()},warnings


def knowledge(p, refs):
    required(p, ('query','documents','version_policy','fixture_only'))
    require(text(p['query']),'query');require(p['fixture_only'] is True,'fixture_only','POLICY_REJECTED')
    require(p['version_policy'] in ('EXACT','LATEST_APPROVED'),'version_policy')
    require(isinstance(p['documents'],list),'documents')
    clause=p.get('requested_clause');require(clause is None or text(clause),'requested_clause')
    docs=[]
    for doc in p['documents']:
        required(doc, ('ref','text','title'))
        source(doc['ref'],refs)
        require(text(doc['text']) and text(doc['title']),'document')
        # Synthetic fixture text must match its declared digest.
        require(digest(doc['text'])==doc['ref']['digest'],'document_digest')
        if clause is not None and doc['ref']['locator']!=clause:continue
        if p['query'].casefold() in (doc['title']+' '+doc['text']).casefold():docs.append(doc)
    versions={}
    for doc in docs: versions.setdefault(doc['ref']['document_id'],set()).add(doc['ref']['version'])
    conflicts=[{'document_id':key,'versions':sorted(value)} for key,value in versions.items() if len(value)>1]
    state='VERSION_CONFLICT' if conflicts else 'FOUND' if docs else 'NOT_FOUND' if not p['documents'] or clause else 'INSUFFICIENT_EVIDENCE'
    citations=[{'ref':deepcopy(doc['ref']),'quote':doc['text']} for doc in docs] if state=='FOUND' else []
    return {'retrieval_status':state,'insufficient_evidence':state!='FOUND','version_conflicts':conflicts,'citations':citations,'answer':None if state!='FOUND' else '\n'.join(c['quote'] for c in citations),'verified_regulatory_conclusion':False,'retrieval_mode':'SYNTHETIC_LEXICAL_FIXTURE'}, [] if state=='FOUND' else [state]

ENGINES={'E1':review,'E2':schedule,'E3':report,'E4':knowledge}
