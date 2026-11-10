from pathlib import Path
from decimal import Decimal
from datetime import date,datetime,timedelta
import hashlib,json
from ai_engine_core.models import digest
O=Path(__file__).resolve().parent
class InvalidDataset(ValueError):pass
def need(ok,message):
 if not ok:raise InvalidDataset(message)
def validate(d):
 need(d['synthetic'] is True,'DATASET_SYNTHETIC');requests=d['requests'];need(len(requests)>=15,'MINIMUM_15');need(len(d['reportDrafts'])==len(d['testResults'])==len(requests),'ONE_TO_ONE_COUNTS')
 for rows,key in [(requests,'requestId'),(requests,'reportId'),(requests,'testItemId'),(d['reportDrafts'],'reportId'),(d['photoReferences'],'assetId'),(d['engineInputs'],'caseId')]:need(len(rows)==len({r[key] for r in rows}),'UNIQUE_'+key)
 reports={r['requestId']:r for r in d['reportDrafts']};results={r['requestId']:r for r in d['testResults']};equipment={r['id']:r for r in d['equipment']}
 need(len(reports)==len(results)==len(requests),'UNIQUE_REQUEST_LINKS')
 catalog=json.loads((O/'data/catalog-snapshot.json').read_text());need(d['catalog']==catalog,'CATALOG_SNAPSHOT')
 for req in requests:
  rid=req['requestId'];report=reports[rid];result=results[rid];need(req['id']==rid and report['reportId']==result['reportId']==req['reportId'] and report['testItemId']==result['testItemId']==req['testItemId'],'FOREIGN_KEYS')
  need(req['testItems']==[req['catalogType']] and req['catalogType'] in catalog['testOptions'],'LEGAL_SINGLE_CATALOG_ITEM');need(report['catalogType']==req['catalogType'],'REPORT_CATALOG')
  need(req['synthetic'] is result['synthetic'] is report['synthetic'] is True,'ROW_SYNTHETIC');need(req['history']==[] and req['status']=='草稿','NO_FORGED_WORKFLOW')
  need(req['conditions']==result['conditions'] and req['method']==result['method'],'CONDITION_CONSISTENCY');need(req['judgementCriteria']==result['rules'],'RULE_CONSISTENCY')
  need(req['timeUnit']=='day' and req['timezone']=='Asia/Taipei' and type(req['duration_days']) is int and req['duration_days']>0,'DAY')
  start=date.fromisoformat(req['startDate']);end=date.fromisoformat(req['endDate']);need(end==start+timedelta(days=req['duration_days']-1),'DATE_DURATION')
  need(len(req['sampleIds'])==len(set(req['sampleIds']))==req['quantity']==len(result['perSampleResults']),'SAMPLE_COUNT')
  eq=equipment[result['equipmentId']];need(req['equipmentIds']==[eq['id']] and eq['kind']==req['equipmentKind'] and req['catalogType'] in eq['catalogTypes'] and eq['methodCapabilities']==req['method'],'EQUIPMENT_COMPATIBILITY')
  need(eq['calibrationEvidence'] is None and eq['sourceTrust']=='SYNTHETIC_ONLY','NO_FAKE_CERTIFICATE')
  need(Decimal(eq['usableVolumeLitres'])/Decimal(req['sampleEnvelope']['sampleVolumeLitres'])>=req['quantity'] and eq['capacity']>=req['quantity'],'SYNTHETIC_CAPACITY')
  need(req['sampleEnvelope']['sampleVolumeLitres']=='0.125' and eq['availability']['startDate']<=req['startDate']<=req['endDate']<=eq['availability']['endDate'],'SYNTHETIC_CAPACITY_WINDOW')
  rows=result['rawMeasurements'];need(len({r['measurementId'] for r in rows})==len(rows),'MEASUREMENT_IDS');need({r['sampleId'] for r in rows}==set(req['sampleIds']),'SAMPLE_IDS')
  rules={r['metric']:r for r in result['rules']};need(len(rules)==len(result['rules']),'RULE_IDS');dec={}
  for row in rows:
   need(row['source']=='SYNTHETIC' and row['phase'] in ('BEFORE','AFTER'),'SYNTHETIC_RAW');need(row['metric'] in rules,'METRIC_RULE');rule=rules[row['metric']]
   need(row['unit']==rule['unit'] and rule['operator']=='CLOSED_INTERVAL','UNITS_OPERATOR');v=Decimal(row['value']);lo=Decimal(rule['lower']);hi=Decimal(rule['upper']);need(v.is_finite() and lo.is_finite() and hi.is_finite() and lo<=hi,'VALID_NUMBERS')
   dec[row['measurementId']]='PASS' if lo<=v<=hi else 'FAIL';dt=datetime.fromisoformat(row['recordedAt']);need(dt.utcoffset()==timedelta(hours=8) and start<=dt.date()<=end,'RAW_TIME')
  for sample in req['sampleIds']:need({r['phase'] for r in rows if r['sampleId']==sample}=={'BEFORE','AFTER'},'BEFORE_AFTER')
  need(len(result['measurementDecisions'])==len(rows),'DECISION_COUNT')
  for x in result['measurementDecisions']:need(x['result']==dec[x['measurementId']] and x['lower']==rules[x['ruleMetric']]['lower'] and x['upper']==rules[x['ruleMetric']]['upper'],'RECALCULATED_MEASUREMENT')
  for sample in result['perSampleResults']:
   mids={r['measurementId'] for r in rows if r['sampleId']==sample['sampleId']};need(set(sample['measurementIds'])==mids,'SAMPLE_ROW_LINK');need(sample['result']==('FAIL' if any(dec[m]=='FAIL' for m in mids) else 'PASS'),'RECALCULATED_SAMPLE')
  overall='FAIL' if 'FAIL' in dec.values() else 'PASS';need(result['overallResult']==report['overallResult']==overall,'RECALCULATED_REPORT')
  need(report['humanReviewStatus']=='PENDING_HUMAN' and report['signatures']==[] and report['status']=='DRAFT_ONLY','HUMAN_REVIEW')
  rawpath=O/result['rawFile'];need(rawpath.resolve().is_relative_to(O/'data/raw'),'RAW_PATH');b=rawpath.read_bytes();need(hashlib.sha256(b).hexdigest()==result['rawFileBytesSha256'],'RAW_BYTES_SHA256');raw=json.loads(b);need(raw['measurements']==rows and raw['conditions']==req['conditions'] and raw['method']==req['method'],'RAW_FILE_MATCH')
  sections=[s for s in d['reportSections'] if s['reportId']==report['reportId']];need(2<=report['pageCount']<=5 and {s['page'] for s in sections}==set(range(1,report['pageCount']+1)),'PAGES');need({s['sectionId'] for s in sections}==set(report['sectionIds']),'SECTION_LINK')
  for section in sections:need(bool(section['title'].strip()) and bool(section['content']) and section['requestId']==rid and section['synthetic'] is True,'NONEMPTY_SECTIONS')
  table=next(s['content'] for s in sections if 'chart' in s['content']);need(set(table['measurementIds'])==set(dec) and table['rawDataRef']==result['rawFile'],'TABLE_RAW_LINK');chart=table['chart'];need(set(chart['sourceMeasurementIds'])=={r['measurementId'] for r in rows if r['metric']==chart['y']} and chart['unit']==rules[chart['y']]['unit'],'CHART_RAW_LINK')
  photos=[p for p in d['photoReferences'] if p['requestId']==rid];need(len(photos)>=2 and {'SETUP','DURING_TEST'}<=set(p['phase'] for p in photos),'PHOTO_REQUIREMENTS')
  for photo in photos:need(photo['assetStatus']=='PENDING_CREATION' and photo['filePath'] is None and photo['synthetic'] is True and photo['reportId']==report['reportId'],'NO_FAKE_IMAGE')
  prov=[p for p in d['sourceProvenance'] if p['requestId']==rid];need(len(prov)==1 and prov[0]['source']=='SYNTHETIC' and prov[0]['rawFileBytesSha256']==result['rawFileBytesSha256'],'SOURCE_PROVENANCE')
 inputs={x['caseId']:x for x in d['engineInputs']};expected={x['caseId']:x['expected'] for x in d['engineExpectedResults']};outputs={x['caseId']:x for x in d['engineExecutionEvidence']};need(set(inputs)==set(expected)==set(outputs),'ENGINE_CASES')
 for case,x in inputs.items():
  ev=outputs[case];out=ev['output'];ex=expected[case];need(out['status']==ex['status'],'ENGINE_STATUS');need(out['audit_metadata']['input_digest']==digest(x['input']) and out['audit_metadata']['output_digest']==digest(out['result_payload']),'ENGINE_AUDIT');need(ev['providerCalled'] is False and ev['publicResult'] is None and ev['synthetic'] is True,'NO_REAL_PROVIDER')
  if 'error' in ex:need(ex['error'] in [e['code'] for e in out['errors']],'ENGINE_ERROR')
  if out['status']=='REJECTED':continue
  p=out['result_payload']
  for key in ('recommendation','human_technical_review_status','retrieval_status','answer'):
   if key in ex:need(p[key]==ex[key],'ENGINE_'+key)
  if 'finding' in ex:need(any(f['code']==ex['finding'] for f in p['findings']),'SPEC_DEVIATION')
  if 'proposalCount' in ex:
   need(len(p['proposals'])==ex['proposalCount'],'PROPOSAL_COUNT')
   if not p['proposals']:need(ev['internalDisposition']=='INDETERMINATE','NO_FAKE_INFEASIBILITY')
   for q in p['proposals']:need(sum(a['sample_count'] for a in q['allocations'])==ex['allocatedCount'] and q['trial_id']==ex['trialId'] and q['applied'] is False,'E2_ALLOCATION')
  if 'original_result' in ex:
   need(p['draft_data']['original_result']==ex['original_result'] and p['review_status']=='PENDING_HUMAN' and [c['within_declared_limits'] for c in p['checks']]==ex['withinDeclaredLimits'],'REPORT_CORE_RESULT')
   rr=reports[x['requestId']];need(rr['engineResultCaseId']==case and rr['coreDraftData']==p['draft_data'] and rr['coreOutputDigest']==out['audit_metadata']['output_digest'],'E3_CORE_DRAFT_PROJECTION')
  need(not out['requires_human_review']['can_approve'],'HUMAN_BOUNDARY')
 for req in requests:
  rid=req['requestId'];e1=inputs[rid+'-E1']['input']['request_payload'];e2=inputs[rid+'-E2']['input']['request_payload'];e4=inputs[rid+'-E4']['input']['request_payload']
  need(e1['request']['conditions']==req['conditions'] and e1['customer_spec']['ref']==req['specRef'],'E1_SOURCE_CONDITION_BINDING')
  need(e2['trial_id']==req['testItemId'] and e2['samples']['count']==req['quantity'] and e2['required_devices']==req['requiredDevices'] and e2['start_date']==req['startDate'] and e2['conditions']==req['conditions'],'E2_REQUEST_BINDING')
  need(e4['documents'][0]['text']==req['specification'] and e4['documents'][0]['ref']==req['specRef'],'E4_SOURCE_BINDING')
 return True
