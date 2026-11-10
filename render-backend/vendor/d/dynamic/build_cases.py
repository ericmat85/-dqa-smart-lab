from pathlib import Path
from copy import deepcopy
from datetime import date,timedelta
import json
from ai_engine_core.models import digest
from dynamic_adapter import exact_native
SOURCE=Path('/workspace/d-comp-1111-ai4-data-p02/data/competition_ai4_demo_dataset_v1.json')
def context(raw):return {'synthetic':True,'sourceCatalog':[{'ref':deepcopy(r),'state':'CURRENT_SYNTHETIC'} for r in raw['source_refs']]}
def cases():
 D=json.loads(SOURCE.read_text());sourceInputs={x['caseId']:x for x in D['engineInputs']};out=[]
 for i,request in enumerate(D['requests'],1):
  for engine in ['E1','E2','E3','E4']:
   base=sourceInputs[request['requestId']+'-'+engine];raw=deepcopy(base['input']);raw['request_id']=f'SYNTH-DYN-{i:03}-{engine}';raw['correlation_id']=f'SYNTH-DYN-COR-{i:03}-{engine}';p=raw['request_payload'];ctx=context(raw)
   if engine=='E1':
    p['request']['product']=f'SYNTH-DYNAMIC-PRODUCT-{i:03}';p['request']['quantity']=i+2;p['request']['date']=str(date(2026,11,10)+timedelta(days=i%3))
    p['request']['numericFields']=[{'name':'duration','value':'2.00','unit':'s','lower':'1.50','upper':'2.50'},{'name':'standby','value':'10','unit':'min','lower':'0','upper':'30'},{'name':'exposure','value':'8','unit':'h','lower':'1','upper':'24'},{'name':'response','value':str(200+i),'unit':'ms','lower':'0','upper':'400'},{'name':'supply','value':'12.5' if i%2 else '12.0','unit':'V','lower':'11.0','upper':'13.0'}]
   elif engine=='E2':
    needed=1+i%2;p['trial_id']=f'SYNTH-DYN-TRIAL-{i:03}';p['samples']['count']=needed+i%4;p['required_devices']=needed;p['start_date']=str(date(2026,11,10)+timedelta(days=i%3));p['duration_days']=1+i%2;p['reservations']=[]
    original=deepcopy(p['equipment'][0]);p['equipment']=[];rows=[]
    for j in range(3):
     m=deepcopy(original);m['id']=f'SYNTH-DYN-EQ-{i:03}-{j}';m['max_samples']=4;m['usable_volume_l']=2;m['ref']=deepcopy(original['ref']);m['ref'].update(document_id=m['id'],version='SYNTH-DYNAMIC-R1');m['ref']['digest']=digest({'equipment_id':m['id'],'usableVolumeLitres':'2','capacity':4,'kind':'SYNTHETIC'})
     p['equipment'].append(m);raw['source_refs'].append(deepcopy(m['ref']));rows.append({'id':m['id'],'usableVolumeLitres':'2','capacity':4,'revision':'SYNTH-DYNAMIC-R1','ref':deepcopy(m['ref']),'availableStart':p['start_date'],'availableEnd':str(date.fromisoformat(p['start_date'])+timedelta(days=p['duration_days']-1))})
    ctx=context(raw);ctx.update(timeUnit='day',timezone='Asia/Taipei',capacityEvidence={'kind':'SYNTHETIC_PHYSICAL_ENVELOPE','unit':'L','fixtureIncluded':True,'sampleVolumeLitres':'0.125','equipment':rows})
   elif engine=='E3':
    lex=[{'name':f'SYNTH-DYN-RESPONSE-{i:03}','unit':'ms','value':str(200+i),'lower':'0','upper':'400'},{'name':f'SYNTH-DYN-SUPPLY-{i:03}','unit':'V','value':'12.5' if i%2 else '12.0','lower':'11.0','upper':'13.0'}]
    p['measurements']=[{'name':x['name'],'unit':x['unit'],'value':exact_native(x['value'],x['unit']),'min':exact_native(x['lower'],x['unit']),'max':exact_native(x['upper'],x['unit'])} for x in lex]
    p['required_fields'].update(report_id=f'SYNTH-DYN-REPORT-{i:03}',trial_id=f'SYNTH-DYN-TRIAL-{i:03}',title='SYNTHETIC dynamic review, not report generation');p['original_result']='PASS';p['raw_data_digest']=digest(p['measurements']);p['raw_data_ref']['digest']=p['raw_data_digest']
    raw['source_refs']=[deepcopy(p['raw_data_ref']) if r['document_id']==p['raw_data_ref']['document_id'] else r for r in raw['source_refs']];ctx=context(raw);ctx.update(requestId=raw['request_id'],reportId=p['required_fields']['report_id'],trialId=p['required_fields']['trial_id'],originalResult='PASS',lexicalMeasurements=lex)
   else:p['query']=['允收條件','必要治具','合成展示'][i%3]
   out.append({'caseId':f'DYN-{i:03}-{engine}','sourceRequestId':request['requestId'],'sourceCaseId':base['caseId'],'sourceInputDigest':digest(base['input']),'engine':engine,'raw':raw,'context':ctx,'expectedStatus':'ADVISORY','expectedCoreCalled':True})
 first={c['engine']:c for c in out[:4]}
 def add(name,e,fn,status,called):
  c=deepcopy(first[e]);c['caseId']='NEG-'+name;fn(c);c['expectedStatus']=status;c['expectedCoreCalled']=called;out.append(c)
 add('E1-VOLTAGE-FORMAT','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][4].update(value='12.00'),'BLOCKED',False)
 add('E1-SECONDS-FORMAT','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][0].update(value='2.0'),'BLOCKED',False)
 add('E1-MINUTES-FORMAT','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][1].update(value='10.5'),'BLOCKED',False)
 add('E1-HOURS-FORMAT','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][2].update(value='8.0'),'BLOCKED',False)
 add('E1-MS-FORMAT','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][3].update(value='200.5'),'BLOCKED',False)
 add('E1-INVALID-DATE','E1',lambda c:c['raw']['request_payload']['request'].update(date='2026-02-30'),'REJECTED',True)
 add('E1-MISSING-FIELD','E1',lambda c:c['raw']['request_payload']['request'].pop('quantity'),'REJECTED',True)
 add('E1-REVOKED-SOURCE','E1',lambda c:c['context']['sourceCatalog'][0].update(state='REVOKED'),'BLOCKED',False)
 add('E1-VOLTAGE-DEVIATION','E1',lambda c:c['raw']['request_payload']['request']['numericFields'][4].update(value='14.0'),'ADVISORY',True)
 add('E1-CONDITION-DEVIATION','E1',lambda c:c['raw']['request_payload']['request']['conditions'].update(temperature_max=35),'ADVISORY',True)
 add('E2-MISSING-CAPACITY','E2',lambda c:c['context'].pop('capacityEvidence'),'BLOCKED',False)
 add('E2-MISSING-VOLUME','E2',lambda c:c['raw']['request_payload']['samples'].pop('volume_l'),'BLOCKED',False)
 def lowcap(c):
  for m in c['raw']['request_payload']['equipment']:m['max_samples']=1
  for m in c['context']['capacityEvidence']['equipment']:m['capacity']=1
 add('E2-LOW-CAPACITY','E2',lowcap,'INDETERMINATE',True)
 def conflict(c):
  p=c['raw']['request_payload'];p['reservations']=[{'equipment_id':m['id'],'start_date':p['start_date'],'expected_end_date':p['start_date'],'pickup_confirmed':False} for m in p['equipment']]
 add('E2-DATE-CONFLICT','E2',conflict,'INDETERMINATE',True)
 add('E2-BAD-DATE','E2',lambda c:c['raw']['request_payload'].update(start_date='2026-13-01'),'BLOCKED',False)
 add('E2-SPACE-UNIT','E2',lambda c:c['context']['capacityEvidence'].update(unit='SPACE_UNIT'),'BLOCKED',False)
 add('E2-WINDOW-MISSING','E2',lambda c:c['context']['capacityEvidence']['equipment'][0].pop('availableEnd'),'BLOCKED',False)
 add('E3-NONNUMERIC','E3',lambda c:c['context']['lexicalMeasurements'][0].update(value='bad'),'BLOCKED',False)
 add('E3-WRONG-PRECISION','E3',lambda c:c['context']['lexicalMeasurements'][1].update(value='12.55'),'BLOCKED',False)
 add('E3-BINDING-MISMATCH','E3',lambda c:c['context'].update(requestId='OTHER'),'BLOCKED',False)
 add('E3-ORIGINAL-DECISION-CHANGED','E3',lambda c:c['raw']['request_payload'].update(original_result='FAIL'),'BLOCKED',False)
 add('E3-NO-ROUNDING-12-1','E3',lambda c:c['context']['lexicalMeasurements'][1].update(value='12.1'),'BLOCKED',False)
 def exceed(c):
  p=c['raw']['request_payload'];c['context']['lexicalMeasurements'][0]['value']='900';p['measurements'][0]['value']=900;p['raw_data_digest']=digest(p['measurements']);p['raw_data_ref']['digest']=p['raw_data_digest'];c['raw']['source_refs']=[deepcopy(p['raw_data_ref']) if r['document_id']==p['raw_data_ref']['document_id'] else r for r in c['raw']['source_refs']];c['context']['sourceCatalog']=[{'ref':deepcopy(r),'state':'CURRENT_SYNTHETIC'} for r in c['raw']['source_refs']]
 add('E3-OUT-OF-RANGE','E3',exceed,'ADVISORY',True)
 add('E4-NO-SOURCE','E4',lambda c:c['raw']['request_payload'].update(documents=[]),'REFUSED',True)
 add('E4-UNSUPPORTED-QUESTION','E4',lambda c:c['raw']['request_payload'].update(query='未記載的正式法規條號是什麼？'),'REFUSED',True)
 add('E4-NONEXISTENT-CLAUSE','E4',lambda c:c['raw']['request_payload'].update(requested_clause='DOES_NOT_EXIST'),'REFUSED',True)
 def versions(c):
  p=c['raw']['request_payload'];d=deepcopy(p['documents'][0]);d['ref']['version']='SYNTH-R2';p['documents'].append(d);c['raw']['source_refs'].append(d['ref']);c['context']['sourceCatalog'].append({'ref':deepcopy(d['ref']),'state':'CURRENT_SYNTHETIC'})
 add('E4-VERSION-CONFLICT','E4',versions,'REFUSED',True)
 add('E4-STALE-SOURCE','E4',lambda c:c['context']['sourceCatalog'][0].update(state='STALE'),'BLOCKED',False)
 return D,out
