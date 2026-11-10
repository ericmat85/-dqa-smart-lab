"""Independent result shape/policy validation; not an approved OpenAPI schema."""
from .models import require, text, number, integer, calendar_date, SourceReference, digest

def validate_result(engine, data, refs, human):
    require(isinstance(data,dict),'result_payload')
    if engine=='E1':
        require(isinstance(data.get('structured_conditions'),dict) and isinstance(data.get('findings'),list),'E1.result')
        require(data.get('human_technical_review_status')==human.technical_review_status,'E1.technical_review','POLICY_REJECTED')
        require(data.get('recommendation') in ('REVIEW_REQUIRED','NO_RULE_DEVIATION') and isinstance(data.get('supervisor_endorsement'),dict),'E1.recommendation')
        c=data['structured_conditions']
        require(all(number(c.get(k)) for k in ('temperature_min','temperature_max','humidity_min','humidity_max')),'E1.conditions')
        require(c['temperature_min']<=c['temperature_max'] and 0<=c['humidity_min']<=c['humidity_max']<=100,'E1.conditions')
        seen=set()
        for finding in data['findings']:
            require(isinstance(finding,dict) and finding.get('code')=='SPEC_DEVIATION' and text(finding.get('field')) and number(finding.get('requested')) and number(finding.get('reference')),'E1.findings')
            key=finding['field']
            require(key in c and key not in seen and finding['requested']==c[key] and finding['requested']!=finding['reference'],'E1.finding_consistency')
            seen.add(key)
        expected='REVIEW_REQUIRED' if data['findings'] or human.technical_review_status!='PASS' else 'NO_RULE_DEVIATION'
        require(data['recommendation']==expected,'E1.recommendation_consistency')
    elif engine=='E2':
        require(isinstance(data.get('proposals'),list) and isinstance(data.get('conflicts'),list) and data.get('applied') is False,'E2.result','POLICY_REJECTED')
        for proposal in data['proposals']:
            require(isinstance(proposal,dict) and proposal.get('granularity')=='DAY' and proposal.get('applied') is False and proposal.get('requires_actual_pickup_confirmation') is True,'E2.proposal','POLICY_REJECTED')
            require(calendar_date(proposal.get('start_date'))<=calendar_date(proposal.get('expected_end_date')),'E2.dates')
            require(text(proposal.get('trial_id')) and isinstance(proposal.get('allocations'),list) and bool(proposal['allocations']),'E2.allocations')
            seen=set()
            for a in proposal['allocations']:
                require(isinstance(a,dict) and text(a.get('equipment_id')) and integer(a.get('sample_count')),'E2.allocation')
                require(a['equipment_id'] not in seen,'E2.duplicate_allocation')
                seen.add(a['equipment_id'])
        for conflict in data['conflicts']:
            require(isinstance(conflict,dict) and text(conflict.get('reason')) and (conflict.get('equipment_id') is None or text(conflict.get('equipment_id'))),'E2.conflict')
    elif engine=='E3':
        draft=data.get('draft_data')
        require(isinstance(draft,dict) and isinstance(draft.get('fields'),dict) and isinstance(draft.get('measurements'),list) and bool(draft['measurements']),'E3.draft')
        require(draft.get('original_result') in ('PASS','FAIL','UNDETERMINED') and data.get('review_status')=='PENDING_HUMAN','E3.review','POLICY_REJECTED')
        require(data.get('raw_data_digest')==digest(draft['measurements']) and any(r.digest==data['raw_data_digest'] for r in refs),'E3.raw_digest','POLICY_REJECTED')
        require(isinstance(data.get('checks'),list) and isinstance(data.get('suggestions'),list),'E3.checks')
        for row in data['checks']:require(isinstance(row,dict) and text(row.get('name')) and type(row.get('within_declared_limits')) is bool,'E3.check')
        require(all(text(draft['fields'].get(k)) for k in ('report_id','trial_id','title')),'E3.fields')
        expected_checks=[];seen=set()
        for row in draft['measurements']:
            require(isinstance(row,dict) and text(row.get('name')) and row['name'] not in seen and text(row.get('unit')),'E3.measurement')
            require(all(number(row.get(k)) for k in ('value','min','max')) and row['min']<=row['max'],'E3.measurement_values')
            seen.add(row['name'])
            expected_checks.append({'name':row['name'],'within_declared_limits':row['min']<=row['value']<=row['max']})
        require(data['checks']==expected_checks,'E3.check_consistency')
        require(all(text(s) for s in data['suggestions']),'E3.suggestions')
    elif engine=='E4':
        state=data.get('retrieval_status')
        require(state in ('FOUND','NOT_FOUND','INSUFFICIENT_EVIDENCE','VERSION_CONFLICT'),'E4.retrieval_status')
        require(isinstance(data.get('citations'),list) and isinstance(data.get('version_conflicts'),list),'E4.evidence')
        seen=set()
        for conflict in data['version_conflicts']:
            require(isinstance(conflict,dict) and text(conflict.get('document_id')) and conflict['document_id'] not in seen,'E4.version_conflict')
            versions=conflict.get('versions')
            require(isinstance(versions,list) and all(text(v) for v in versions) and len(set(versions))==len(versions) and len(versions)>1,'E4.version_conflict')
            seen.add(conflict['document_id'])
        require(state=='VERSION_CONFLICT' or not data['version_conflicts'],'E4.conflict_state')
        require(data.get('verified_regulatory_conclusion') is False and data.get('retrieval_mode')=='SYNTHETIC_LEXICAL_FIXTURE','E4.verified','POLICY_REJECTED')
        if state=='FOUND':
            require(data.get('insufficient_evidence') is False and not data['version_conflicts'] and bool(data['citations']),'E4.evidence','SOURCE_NOT_FOUND')
            for citation in data['citations']:
                require(isinstance(citation,dict),'E4.citation','SOURCE_NOT_FOUND')
                ref=SourceReference.parse(citation.get('ref'))
                require(ref in refs and text(citation.get('quote')) and digest(citation['quote'])==ref.digest,'E4.quote','SOURCE_NOT_FOUND')
            require(data.get('answer')=='\n'.join(c['quote'] for c in data['citations']),'E4.answer','POLICY_REJECTED')
        else:
            require(data.get('answer') is None and not data['citations'] and data.get('insufficient_evidence') is True,'E4.refusal','POLICY_REJECTED')
            if state=='VERSION_CONFLICT':require(bool(data['version_conflicts']),'E4.version_conflicts')
    else:
        require(False,'engine_id')
    return True
