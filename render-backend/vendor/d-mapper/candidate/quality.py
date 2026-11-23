"""Synthetic-only quality boundary; NOT a B/D or V0.2 implementation."""
from copy import deepcopy
from decimal import Decimal
import re
from ai_engine_core.models import EngineRequest,ValidationError,calendar_date,digest
from ai_engine_core.service import EngineCore
from ai_engine_core.simulation import FakeModelProvider
from ai_engine_core.orchestration_validation import validate_model_output,OrchestrationFault
from ai_engine_core.provider import ProviderUnavailable

MODE='SYNTHETIC_TEST_ONLY'
class QualityBlock(ValueError):pass

def need(ok,category):
    if not ok:raise QualityBlock(category)

def litres(v):
    need(type(v) is str and re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]+)?',v) is not None,'INVALID_LITRES_EVIDENCE')
    d=Decimal(v);need(d.is_finite() and d>0,'INVALID_LITRES_EVIDENCE');return d

def sources(req,ctx):
    need(type(ctx) is dict and ctx.get('mode')==MODE,'SYNTHETIC_CONTEXT_REQUIRED')
    need(ctx.get('timezone')=='Asia/Taipei','TIMEZONE_REQUIRED')
    rows=ctx.get('sources');need(type(rows) is list,'SOURCE_CATALOG_MISSING')
    seen=set()
    for row in rows:
        need(type(row) is dict and type(row.get('ref')) is dict,'SOURCE_ROW_INVALID')
        key=(row['ref'].get('document_id'),row['ref'].get('version'),row['ref'].get('locator'))
        need(all(type(x) is str and x.strip() for x in key),'SOURCE_ROW_INVALID')
        need(key not in seen,'DUPLICATE_SOURCE');seen.add(key)
    for ref in req.source_refs:
        matches=[row for row in rows if all(row['ref'].get(k)==getattr(ref,k) for k in ('document_id','version','locator','digest'))]
        need(len(matches)==1,'SOURCE_VERSION_OR_DIGEST_MISMATCH')
        need(matches[0].get('state')=='CURRENT_SYNTHETIC','SOURCE_NOT_CURRENT')

def capacity(p,ctx):
    ev=ctx.get('capacity_evidence');need(type(ev) is dict,'CAPACITY_EVIDENCE_MISSING')
    need(ev.get('unit')=='L' and ev.get('kind')=='SYNTHETIC_SAMPLE_AND_FIXTURE_ENVELOPE','PHYSICAL_LITRES_UNVERIFIED')
    need(ev.get('fixture_included') is True,'FIXTURE_EVIDENCE_MISSING')
    need(ev.get('source_ref')==p['equipment'][0]['ref'] if p['equipment'] else False,'CAPACITY_SOURCE_MISSING')
    need(litres(ev['sample_litres'])==Decimal(str(p['samples']['volume_l'])),'SAMPLE_VOLUME_MISMATCH')
    rows=ev.get('equipment');need(type(rows) is list,'EQUIPMENT_EVIDENCE_MISSING')
    ids=[r.get('id') for r in rows if type(r) is dict];need(len(ids)==len(rows) and len(set(ids))==len(ids),'DUPLICATE_EQUIPMENT_EVIDENCE')
    need(set(ids)=={m['id'] for m in p['equipment']},'EQUIPMENT_EVIDENCE_SCOPE')
    for m in p['equipment']:
        r=next(r for r in rows if r['id']==m['id'])
        need(r.get('source_ref')==m['ref'],'CAPACITY_SOURCE_MISSING')
        need(litres(r['usable_litres'])==Decimal(str(m['usable_volume_l'])),'EQUIPMENT_VOLUME_MISMATCH')
        need(type(r.get('max_samples')) is int and r['max_samples']==m['max_samples'],'COUNT_CAPACITY_MISMATCH')
        need(r.get('configuration_fixture')=='SYNTH-CONFIG-1' and r.get('placement_check')=='SYNTHETIC_PASS','PLACEMENT_EVIDENCE_MISSING')
    windows=ctx.get('availability');need(type(windows) is list,'AVAILABILITY_MISSING')
    need(len(windows)==len(p['equipment']) and {w.get('equipment_id') for w in windows}=={m['id'] for m in p['equipment']},'AVAILABILITY_SCOPE')
    for w in windows:
        need(w.get('revision')=='SYNTH-AVAIL-1','AVAILABILITY_VERSION')
        need(calendar_date(w['from_date'])<=calendar_date(w['through_date']),'AVAILABILITY_DATE_ORDER')

def envelope(engine,status,rule,model,errors,calls,stage):
    return {'mode':MODE,'engine_id':engine,'status':status,'rule_response':deepcopy(rule),'fake_response':deepcopy(model),'errors':errors,'fake_calls':calls,'stage':stage,
        'time_unit':'DAY','timezone':'Asia/Taipei','requires_human_confirmation':True,'customer_authorization':'UNVERIFIED',
        'business_state_modified':False,'reservation_created':False,'formal_job_terminal_state':None,'public_result':None,
        'infeasibility_proof':'NOT_IMPLEMENTED','real_provider_called':False,'v02_contract_status':'INCOMPLETE_NOT_APPROVED_NOT_IMPLEMENTABLE','usage':'NOT_REPORTED'}

def run(raw,ctx,*,fake=None):
    engine='UNKNOWN';stage='INPUT_EVIDENCE';calls=0
    try:
        req=EngineRequest.parse(deepcopy(raw));engine=req.engine_id
        sources(req,ctx)
        if engine=='E4':need(req.request_payload.get('version_policy')!='LATEST_APPROVED','LATEST_APPROVED_AUTHORITY_PENDING')
        # Actual core runs even when no model is requested. It owns native
        # structural validation and all deterministic rule checks.
        stage='RULE_CORE';rules=EngineCore().run(deepcopy(raw),actor_id='SYNTH-QUALITY',occurred_at='2026-11-08T12:00:00+08:00')
        if rules.status=='REJECTED':
            return envelope(engine,'REJECTED',None,None,[{'code':e.code,'category':'NATIVE_RULE_REJECTED'} for e in rules.errors],0,stage)
        rule=rules.to_dict();p=req.request_payload;data=rules.result_payload
        stage='SYNTHETIC_SEMANTIC_BOUNDARY'
        if engine=='E2':
            capacity(p,ctx)
            if not data['proposals']:
                # The actual core has no complete domain/candidate/proof ledger.
                # Do not promote its local zero candidates to proven infeasibility.
                return envelope(engine,'INDETERMINATE',rule,None,[{'code':'EVIDENCE_INSUFFICIENT','category':'FULL_ENUMERATION_NOT_AVAILABLE'}],0,stage)
            for proposal in data['proposals']:
                for a in proposal['allocations']:
                    w=next(w for w in ctx['availability'] if w['equipment_id']==a['equipment_id'])
                    need(w['from_date']<=proposal['start_date'] and proposal['expected_end_date']<=w['through_date'],'OUTSIDE_SYNTHETIC_AVAILABILITY')
        if engine=='E4' and data['retrieval_status']!='FOUND':
            return envelope(engine,'REFUSED',rule,None,[],0,stage)
        stage='FAKE_OUTPUT'
        provider=FakeModelProvider() if fake is None else fake
        need(type(provider) is FakeModelProvider,'FAKE_ONLY')
        before=digest(raw);calls=1
        packet=provider.generate({'engine_id':engine,'correlation_id':rules.correlation_id,'rule_result':deepcopy(data)})
        model=validate_model_output(packet,engine,rules.correlation_id,data)
        need(before==digest(raw),'INPUT_MUTATED')
        return envelope(engine,'ADVISORY',rule,model,[],calls,stage)
    except QualityBlock as e:code,cat='QUALITY_BLOCKED',str(e)
    except ValidationError as e:code,cat=e.code,'INVALID_INPUT_OR_SOURCE'
    except OrchestrationFault as e:code,cat=e.code,e.category
    except TimeoutError:code,cat='TIMEOUT','SIMULATED_TIMEOUT'
    except ProviderUnavailable:code,cat='MODEL_UNAVAILABLE','SIMULATED_PROVIDER_UNAVAILABLE'
    except Exception:code,cat='INVALID_INPUT','INVALID_SYNTHETIC_INPUT'
    return envelope(engine,'BLOCKED',None,None,[{'code':code,'category':cat}],calls,stage)
