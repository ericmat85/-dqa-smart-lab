"""D-only dynamic numeric/source validation around unchanged Rules Core."""
from copy import deepcopy
from decimal import Decimal,InvalidOperation
from datetime import date,timedelta
import re,math
from ai_engine_core.service import EngineCore
from ai_engine_core.models import digest
class Block(ValueError):pass
def require(ok,code):
 if not ok:raise Block(code)
def number(value,unit):
 # Preserve lexical scale. Validating does not repair/pad/round input.
 if unit in ('min','h','ms'):
  require((type(value) is int and value>=0) or (type(value) is str and re.fullmatch(r'(?:0|[1-9][0-9]*)',value)), 'INTEGER_FORMAT_REQUIRED:'+unit)
 elif unit in ('s','V'):
  pattern=r'-?(?:0|[1-9][0-9]*)\.[0-9]{'+('2' if unit=='s' else '1')+'}'
  require(type(value) is str and re.fullmatch(pattern,value), 'FIXED_DECIMAL_FORMAT_REQUIRED:'+unit)
 else:require(type(value) in (str,int,float) and type(value) is not bool,'NUMERIC_VALUE_REQUIRED')
 try:v=Decimal(str(value))
 except InvalidOperation:raise Block('INVALID_NUMERIC') from None
 require(v.is_finite(),'FINITE_VALUE_REQUIRED');return v

def exact_native(value,unit):
 d=number(value,unit)
 if d==d.to_integral_value():return int(d)
 f=float(d);require(math.isfinite(f) and Decimal.from_float(f)==d and Decimal(str(f))==d,'CORE_EXACT_NUMERIC_PROJECTION_UNSUPPORTED')
 return f

def source_check(raw,context):
 require(type(context) is dict and context.get('synthetic') is True,'SYNTHETIC_CONTEXT_REQUIRED')
 catalog=context.get('sourceCatalog');require(type(catalog) is list,'SOURCE_CATALOG_REQUIRED')
 for ref in raw['source_refs']:
  matches=[r for r in catalog if r.get('ref')==ref];require(len(matches)==1 and matches[0].get('state')=='CURRENT_SYNTHETIC','SOURCE_NOT_CURRENT_OR_MISMATCH')

def prepare(raw,context):
 raw=deepcopy(raw);p=raw['request_payload'];engine=raw['engine_id'];source_check(raw,context);findings=[]
 if engine=='E1':
  rows=p['request'].get('numericFields');require(type(rows) is list and bool(rows),'NUMERIC_FIELDS_REQUIRED')
  require(len({x['name'] for x in rows})==len(rows),'DUPLICATE_NUMERIC_FIELD')
  for x in rows:
   value=number(x['value'],x['unit']);lo=number(x['lower'],x['unit']);hi=number(x['upper'],x['unit']);require(lo<=hi,'LIMIT_ORDER')
   if not lo<=value<=hi:findings.append({'code':'NUMERIC_SPEC_DEVIATION','field':x['name'],'value':x['value'],'unit':x['unit'],'lower':x['lower'],'upper':x['upper'],'validator':'DYNAMIC_ADAPTER_DECIMAL_ONLY'})
 elif engine=='E2':
  ev=context.get('capacityEvidence');require(type(ev) is dict and ev.get('kind')=='SYNTHETIC_PHYSICAL_ENVELOPE' and ev.get('unit')=='L' and ev.get('fixtureIncluded') is True,'CAPACITY_EVIDENCE_REQUIRED')
  # No Space Unit conversion or new capacity algorithm; only bind supplied evidence.
  require(Decimal(ev['sampleVolumeLitres'])==Decimal(str(p['samples']['volume_l'])),'SAMPLE_VOLUME_EVIDENCE_MISMATCH')
  rows=ev['equipment'];require(len(rows)==len(p['equipment']) and {r['id'] for r in rows}=={m['id'] for m in p['equipment']},'EQUIPMENT_EVIDENCE_SCOPE')
  start=date.fromisoformat(p['start_date']);days=p['duration_days'];require(type(days) is int and days>0,'DAY_DURATION_INTEGER');end=start+timedelta(days=days-1)
  require(context.get('timeUnit')=='day' and context.get('timezone')=='Asia/Taipei','DAY_TIMEZONE')
  for m in p['equipment']:
   row=next(r for r in rows if r['id']==m['id']);require(row['ref']==m['ref'] and row['revision']=='SYNTH-DYNAMIC-R1','CAPACITY_SOURCE_VERSION')
   require(Decimal(row['usableVolumeLitres'])==Decimal(str(m['usable_volume_l'])) and type(row['capacity']) is int and row['capacity']==m['max_samples'],'CAPACITY_EVIDENCE_MISMATCH')
   require(date.fromisoformat(row['availableStart'])<=start<=end<=date.fromisoformat(row['availableEnd']),'EQUIPMENT_WINDOW_UNVERIFIED')
 elif engine=='E3':
  require(context['requestId']==raw['request_id'] and context['trialId']==p['required_fields']['trial_id'] and context['reportId']==p['required_fields']['report_id'],'REQUEST_REPORT_BINDING_MISMATCH')
  require(p['original_result']==context['originalResult'],'ORIGINAL_RESULT_CHANGED')
  lexical=context['lexicalMeasurements'];require(len(lexical)==len(p['measurements']),'MEASUREMENT_ROW_COUNT')
  require(len({r['name'] for r in lexical})==len(lexical),'DUPLICATE_MEASUREMENT')
  for x,native in zip(lexical,p['measurements']):
   converted={'name':x['name'],'unit':x['unit'],'value':exact_native(x['value'],x['unit']),'min':exact_native(x['lower'],x['unit']),'max':exact_native(x['upper'],x['unit'])}
   require(converted==native,'LEXICAL_NATIVE_VALUE_MISMATCH')
  require(p['raw_data_digest']==digest(p['measurements'])==p['raw_data_ref']['digest'],'MEASUREMENT_DIGEST')
 return raw,findings

def run(raw,context):
 original=deepcopy((raw,context))
 try:
  admitted,findings=prepare(raw,context)
 except (Block,ValueError,KeyError,TypeError,OverflowError) as e:
  return {'status':'BLOCKED','reason':str(e) if isinstance(e,Block) else 'INVALID_INPUT_OR_CONTEXT','coreCalled':False,'coreOutput':None,'publicResult':None,'providerCalled':False,'preservedInput':deepcopy(raw),'inputDigest':digest(raw),'contextDigest':digest(context)}
 out=EngineCore().run(admitted,actor_id='SYNTH-DYNAMIC-INPUT',occurred_at='2026-11-09T10:00:00+08:00').to_dict();payload=out['result_payload']
 status='REJECTED' if out['status']=='REJECTED' else 'INDETERMINATE' if raw['engine_id']=='E2' and not payload['proposals'] else 'REFUSED' if raw['engine_id']=='E4' and payload['retrieval_status']!='FOUND' else 'ADVISORY'
 require((raw,context)==original,'INPUT_MUTATION')
 return {'status':status,'reason':None,'coreCalled':True,'coreOutput':out,'adapterFindings':findings,'publicResult':None,'providerCalled':False,'preservedInput':deepcopy(raw),'inputDigest':digest(raw),'contextDigest':digest(context),'numericChecks':'ADAPTER_VALIDATION_SEPARATE_FROM_CORE','reportGeneration':'NOT_IMPLEMENTED','fullEnumeration':'NOT_PROVEN','reservationCreated':False,'requiresHumanConfirmation':True}
