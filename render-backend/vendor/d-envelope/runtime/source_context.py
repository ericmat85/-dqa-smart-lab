"""Synthetic-only registry provenance. No authority, network or Provider seam."""
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
import hashlib,json,math
from ai_engine_core.models import EngineRequest,digest
from candidate.quality import sources,QualityBlock

ROOT=Path(__file__).resolve().parent
class BridgeFault(ValueError):
    def __init__(self,status,code):self.status,self.code=status,code;super().__init__(code)
def need(ok,code,status='BLOCKED'):
    if not ok:raise BridgeFault(status,code)
def fingerprint(operation,payload):
    return digest({'operation':operation,'payload':payload})
def seal(record):
    value=deepcopy(record);value.pop('record_digest',None);return digest(value)
def load_registry():
    return json.loads((ROOT/'synthetic_registry.json').read_text())
def exact_native_litres(value):
    need(type(value) is str,'DECIMAL_STRING_REQUIRED')
    d=Decimal(value);need(d.is_finite() and d>0,'POSITIVE_LITRES_REQUIRED')
    if d==d.to_integral_value():
        n=int(d);need(math.isfinite(n),'NATIVE_NUMBER_RANGE');return n
    f=float(d)
    # Both binary conversion and the native Core Decimal(str(number)) path
    # must preserve the exact input value; no tolerance or rounding.
    need(math.isfinite(f) and Decimal.from_float(f)==d and Decimal(str(f))==d,'DECIMAL_NOT_EXACT_FOR_NATIVE_CORE')
    return f

def resolve(operation,payload,registry):
    need(type(registry) is dict and registry.get('mode')=='SYNTHETIC_TEST_ONLY' and registry.get('registry_version')=='d-stage-0.1','REGISTRY_INVALID','INVALID_SOURCE')
    fp=fingerprint(operation,payload);entries=registry.get('entries');need(type(entries) is list,'REGISTRY_INVALID','INVALID_SOURCE')
    keys=[(x.get('operation'),x.get('fingerprint')) for x in entries if type(x) is dict]
    need(len(keys)==len(entries) and len(set(keys))==len(keys),'DUPLICATE_REGISTRY_ENTRY','INVALID_SOURCE')
    matches=[e for e in entries if e['operation']==operation and e['fingerprint']==fp]
    if not matches:
        if operation=='assistant' and type(payload.get('documents')) is list:
            known={d['source_id']:set() for e in entries if e['operation']==operation for d in e['wire_payload']['documents']}
            for e in entries:
                if e['operation']==operation:
                    for d in e['wire_payload']['documents']:known[d['source_id']].add(d['revision'])
            if any(d.get('source_id') in known and d.get('revision') not in known[d['source_id']] for d in payload['documents']):
                raise BridgeFault('STALE_VERSION','UNREGISTERED_DOCUMENT_VERSION')
        raise BridgeFault('BLOCKED','FULL_INPUT_NOT_REGISTERED')
    rec=deepcopy(matches[0])
    need(rec.get('record_digest')==seal(rec) and rec['wire_payload']==payload and rec['fingerprint']==fp,'REGISTRY_RECORD_TAMPERED','INVALID_SOURCE')
    need(rec.get('source_mode')=='AUTHOR_DECLARED_SYNTHETIC_NOT_B_RUNTIME','REGISTRY_SOURCE_MODE','INVALID_SOURCE')
    for item in rec['core_inputs']:
        req=EngineRequest.parse(item['request'])
        try:sources(req,item['context'])
        except QualityBlock as e:
            stale=any(x.get('state')=='STALE' for x in item['context'].get('sources',[]))
            raise BridgeFault('STALE_VERSION' if stale else 'INVALID_SOURCE','REGISTERED_SOURCE_NOT_CURRENT') from None
    if rec.get('admission_block'):raise BridgeFault('BLOCKED',rec['admission_block'])
    return rec
