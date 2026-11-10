"""Synthetic fixture authoring and actual existing rule Core execution, no LLM."""
from pathlib import Path
from copy import deepcopy
from decimal import Decimal
from datetime import date,timedelta
import json,hashlib
from ai_engine_core.service import EngineCore
from ai_engine_core.models import digest
O=Path(__file__).resolve().parent
MARK='SYNTHETIC_DEMO_NOT_CUSTOMER_SPEC'
def write(name,data):
 p=O/name;p.parent.mkdir(parents=True,exist_ok=True);b=(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode();p.write_bytes(b);return hashlib.sha256(b).hexdigest()
def ref(id,version,locator,value):return {'document_id':id,'version':version,'locator':locator,'digest':digest(value)}
def cond(lo,hi,rlo=40,rhi=60):return {'temperature_min':lo,'temperature_max':hi,'humidity_min':rlo,'humidity_max':rhi}
# All numbers/methods below are explicit SYNTHETIC DEMO baselines, not named standards.
PROFILES=[
 ('一般性能合成案例','其他','BENCH','response_ms','ms',0,300,180,cond(23,27),{'supplyV':12,'inputFrequencyHz':200,'observationHours':8}),
 ('高溫動作','高溫試驗','HOT_POWERED','display_response_ms','ms',0,350,200,cond(83,87),{'temperatureC':85,'powered':True,'exposureHours':8}),
 ('低溫動作','低溫試驗','COLD_POWERED','startup_ms','ms',0,800,500,cond(-22,-18),{'temperatureC':-20,'powered':True,'exposureHours':8}),
 ('高溫儲存','高溫試驗','HOT_STORAGE','post_storage_voltage','V',11,13,12,cond(98,102),{'temperatureC':100,'powered':False,'exposureHours':8}),
 ('低溫儲存','低溫試驗','COLD_STORAGE','post_storage_current','mA',80,120,100,cond(-32,-28),{'temperatureC':-30,'powered':False,'exposureHours':8}),
 ('高溫高濕','高溫高濕','HUMIDITY','insulation_resistance','MOhm',10,1000,100,cond(58,62,88,92),{'temperatureC':60,'humidityRH':90,'exposureHours':8,'corrosionAllowed':False}),
 ('溫度循環','溫度循環','THERMAL_CYCLE','post_cycle_response_ms','ms',0,400,200,cond(-22,82),{'lowC':-20,'highC':80,'dwellMinutes':10,'transferMinutes':1,'cycles':20}),
 ('冷熱衝擊','熱衝擊','THERMAL_SHOCK','continuity_resistance','Ohm',0,4,1,cond(-32,102),{'lowC':-30,'highC':100,'dwellMinutes':5,'transferMinutes':1,'cycles':20}),
 ('耐熱衝擊合成變體','熱衝擊','THERMAL_SHOCK','post_shock_voltage','V',11,13,12,cond(-12,112),{'lowC':-10,'highC':110,'dwellMinutes':5,'transferMinutes':1,'cycles':20}),
 ('振動','振動試驗','VIBRATION','contact_resistance','mOhm',0,100,30,cond(23,27),{'frequencyMinHz':10,'frequencyMaxHz':200,'accelerationG':3,'axes':['X','Y','Z'],'hoursPerAxis':1,'mounting':'SYNTH-RIG-V1'}),
 ('機械衝擊','機械衝擊','MECHANICAL_SHOCK','latch_retention_force','N',20,100,50,cond(23,27),{'waveform':'SYNTH_HALF_SINE','peakG':20,'pulseMs':10,'axes':['X','Y','Z'],'pulsesPerDirection':3}),
 ('防水','IPX6 防水','WATER','insulation_after_spray','MOhm',10,1000,100,cond(23,27),{'demoNozzleMm':12,'demoFlowLMin':100,'demoDistanceM':3,'sprayMinutes':3,'standardComplianceClaim':False}),
 ('鹽霧','鹽霧試驗','SALT','corrosion_area','percent',0,5,1,cond(33,37,90,95),{'solutionPercent':5,'temperatureC':35,'pH':7,'exposureHours':8}),
 ('靜電放電','ESD 靜電','ESD','recover_time','ms',0,500,200,cond(23,27),{'contactKV':4,'airKV':8,'points':['SYNTH-P1','SYNTH-P2'],'dischargesPerPolarity':10,'standardComplianceClaim':False}),
 ('暗電流合成案例','其他','CURRENT_BENCH','standby_current','mA',0,0.125,0.0625,cond(23,27),{'supplyV':12,'standbyMinutes':10,'ignition':'OFF'})]

def build():
 catalog=json.loads((O/'data/catalog-snapshot.json').read_text())
 D={'datasetVersion':'competition-ai4-demo/1.0','synthetic':True,'purpose':MARK,'catalog':catalog,'requests':[],'testResults':[],'reportDrafts':[],'reportSections':[],'photoReferences':[],'engineInputs':[],'engineExpectedResults':[],'engineExecutionEvidence':[],'sourceProvenance':[],'equipment':[],'workflowDemo':{'stages':['待簽核','待審查','待排程','待確認','試驗中','已完成','待審核','待查閱','已結案'],'execution':'NOT_EXECUTED','authority':'EXISTING_WORKFLOW_ONLY','automaticTransitions':False}}
 for i,pf in enumerate(PROFILES,1):
  label,cat,kind,metric,unit,lo,hi,normal,conditions,method=deepcopy(pf);assert cat in catalog['testOptions']
  rid=f'SYNTH-REQ-{i:03}';rep=f'SYNTH-REP-{i:03}';tid=f'SYNTH-TI-{i:03}';eid=f'SYNTH-EQ-{i:03}';sid=f'SYNTH-SPEC-{i:03}';samples=[f'{rid}-S{j}' for j in range(1,4)];start=date(2026,11,1)+timedelta(days=i%4);days=1;end=start+timedelta(days=days-1)
  query=f'{sid} 允收條件';doctext=f'{MARK}。{query}：{label}的{metric}需介於 {lo} 與 {hi} {unit}（含端點），外觀缺陷數需為 0；必要治具計入樣品包絡。數值僅為合成展示，非客戶或正式規範。'
  spec=ref(sid,'SYNTH-R1','DemoAcceptance/1',doctext);template=ref('SYNTH-TEMPLATE','SYNTH-R1','report-layout',{'type':cat,'version':'1'})
  equipment={'id':eid,'name':f'SYNTH {kind} 設備','kind':kind,'catalogTypes':[cat],'usableVolumeLitres':'8','capacity':12,'configurationId':f'SYNTH-CONFIG-{i:03}','calibrationEvidence':None,'sourceTrust':'SYNTHETIC_ONLY','conditions':cond(-50,130,0,100),'methodCapabilities':deepcopy(method),'availability':{'startDate':str(start),'endDate':str(end),'revision':'SYNTH-AVAIL-1'},'synthetic':True}
  eref=ref(eid,'SYNTH-R1','synthetic-equipment',equipment)
  rules=[{'metric':metric,'unit':unit,'lower':str(lo),'upper':str(hi),'operator':'CLOSED_INTERVAL','sourceRef':spec},{'metric':'appearance_defect_count','unit':'count','lower':'0','upper':'0','operator':'CLOSED_INTERVAL','sourceRef':spec}]
  request={'id':rid,'requestId':rid,'reportId':rep,'testItemId':tid,'testItems':[cat],'catalogType':cat,'testVariant':label,'requester':f'SYNTH 委託者 {i:02}','ownerId':f'SYNTH-REQUESTER-{i:02}','supervisorId':f'SYNTH-SUPERVISOR-{i:02}','project':f'SYNTH 競賽專案 {i:02}','product':f'SYNTH 儀錶模組 {i:02}','productCode':f'SYNTH-PROD-{i:03}','quantity':3,'sampleIds':samples,'sampleEnvelope':{'sampleBodyLitres':'0.0625','fixtureOccupiedLitres':'0.0625','sampleVolumeLitres':'0.125','kind':'SYNTHETIC_PHYSICAL_ENVELOPE_MEASUREMENT','derivation':'Synthetic enclosing envelope measured as 0.125 L; component figures illustrative only, not an approved geometric sum algorithm.','sourceRef':spec},'equipmentKind':kind,'requiredDevices':1,'equipmentIds':[eid],'engineerId':f'SYNTH-ENGINEER-{i:03}','startDate':str(start),'endDate':str(end),'duration_days':days,'timeUnit':'day','timezone':'Asia/Taipei','conditions':conditions,'method':method,'specification':doctext,'judgementCriteria':rules,'specRef':spec,'status':'草稿','history':[],'supervisorEndorsement':{'status':'PENDING_HUMAN'},'technicalReview':'UNKNOWN','synthetic':True,'purpose':MARK}
  raw=[]
  for j,sample in enumerate(samples,1):
   for phase in ['BEFORE','AFTER']:
    value=Decimal(str(normal))
    if i%4==0 and j==3 and phase=='AFTER':value=Decimal(str(hi))+1
    for m,u,v in [(metric,unit,str(value)),('appearance_defect_count','count','0')]:
     raw.append({'measurementId':f'{rid}-{j}-{phase}-{m}','sampleId':sample,'phase':phase,'metric':m,'value':v,'unit':u,'recordedAt':str(start)+('T08:00:00+08:00' if phase=='BEFORE' else 'T17:00:00+08:00'),'cycleCount':method.get('cycles'),'source':'SYNTHETIC'})
  limits={r['metric']:r for r in rules};decisions=[]
  for row in raw:
   rule=limits[row['metric']];ok=Decimal(rule['lower'])<=Decimal(row['value'])<=Decimal(rule['upper']);decisions.append({'measurementId':row['measurementId'],'ruleMetric':row['metric'],'lower':rule['lower'],'upper':rule['upper'],'operator':'CLOSED_INTERVAL','result':'PASS' if ok else 'FAIL'})
  per=[{'sampleId':s,'measurementIds':[x['measurementId'] for x in raw if x['sampleId']==s],'result':'FAIL' if any(d['result']=='FAIL' for d in decisions if d['measurementId'] in [x['measurementId'] for x in raw if x['sampleId']==s]) else 'PASS'} for s in samples]
  overall='FAIL' if any(x['result']=='FAIL' for x in per) else 'PASS'
  measurements=[{'name':x['measurementId'],'value':float(Decimal(x['value'])),'unit':x['unit'],'min':float(Decimal(limits[x['metric']]['lower'])),'max':float(Decimal(limits[x['metric']]['upper']))} for x in raw]
  rawbody={'requestId':rid,'reportId':rep,'testItemId':tid,'synthetic':True,'conditions':conditions,'method':method,'measurements':raw};rawsha=write(f'data/raw/{rid}.json',rawbody)
  rawref=ref(f'SYNTH-RAW-{i:03}','SYNTH-R1','measurements',measurements)
  result={'requestId':rid,'reportId':rep,'testItemId':tid,'conditions':conditions,'method':method,'rawMeasurements':raw,'rules':rules,'measurementDecisions':decisions,'perSampleResults':per,'overallResult':overall,'equipmentId':eid,'rawFile':f'data/raw/{rid}.json','rawFileBytesSha256':rawsha,'nativeMeasurementsDigest':digest(measurements),'synthetic':True}
  photos=[]
  for phase in ['SETUP','DURING_TEST']:
   ph={'assetId':f'SYNTH-ASSET-{i:03}-{phase}','requestId':rid,'reportId':rep,'testItemId':tid,'phase':phase,'purpose':f'{label}—'+('設備、樣品與治具配置' if phase=='SETUP' else '施測與監控紀錄'),'description':f'{MARK}；{kind}；設備 {eid}；樣品 {", ".join(samples)}；條件 {method}。不得加入真實品牌、校驗證書或簽章。','assetStatus':'PENDING_CREATION','filePath':None,'synthetic':True};photos.append(ph)
  pages=2+(i%4);sections=[]
  def section(page,title,content):
   sections.append({'sectionId':f'{rep}-SEC-{len(sections)+1}','reportId':rep,'requestId':rid,'page':page,'title':title,'content':content,'synthetic':True})
  section(1,'基本資料與合成基準',{'testItemId':tid,'catalogType':cat,'variant':label,'product':request['product'],'samples':samples,'conditions':conditions,'method':method,'equipment':equipment,'sourceRef':spec,'disclaimer':MARK})
  section(2,'方法、過程與圖片需求',{'steps':[f'識別 {rid} 的三個合成樣品及治具','確認合成設備配置與試前功能','依 Demo 方法參數施測並記錄原值','比較明確基準並送人工審核'],'photoAssetIds':[x['assetId'] for x in photos],'processLog':[{'at':str(start)+'T08:00:00+08:00','action':'BEFORE_FUNCTION_CHECK'},{'at':str(start)+'T09:00:00+08:00','action':'SYNTHETIC_EXPOSURE_START','method':method},{'at':str(start)+'T17:00:00+08:00','action':'AFTER_FUNCTION_CHECK'}]})
  table={'rawDataRef':result['rawFile'],'measurementIds':[x['measurementId'] for x in raw],'rules':rules,'perSampleResults':per,'overallResult':overall,'chart':{'sourceMeasurementIds':[x['measurementId'] for x in raw if x['metric']==metric],'x':'sampleId/phase','y':metric,'unit':unit},'rawFileBytesSha256':rawsha}
  section(2 if pages==2 else 3,'原始量測、圖表與可重算判定',table)
  failed=[d['measurementId'] for d in decisions if d['result']=='FAIL'];anomalies=[{'measurementId':x,'description':'合成數值超出此 Demo 閉區間基準，需人工審查；不可改寫原判。'} for x in failed]
  section(min(pages,4),'異常、結論草稿及人工審核',{'anomalies':anomalies,'conclusionDraft':f'{label}合成資料依 Demo 基準計算為 {overall}；非正式試驗結論，待人工審核。','humanReviewStatus':'PENDING_HUMAN','signatures':[],'authoritativeResult':False})
  if pages>=4:section(4,'逐樣品試前試後功能追溯',{'sampleIds':samples,'measurementIds':[x['measurementId'] for x in raw],'rawDataRef':result['rawFile'],'sourceRef':rawref})
  if pages==5:section(5,'附件與版本追溯',{'specificationVersion':spec['version'],'equipmentConfiguration':equipment['configurationId'],'rawFile':result['rawFile'],'rawFileBytesSha256':rawsha,'humanReviewStatus':'PENDING_HUMAN','imageRequirements':[x['assetId'] for x in photos]})
  draft={'requestId':rid,'reportId':rep,'testItemId':tid,'title':f'{label}—SYNTHETIC 試驗報告草稿','catalogType':cat,'pageCount':pages,'sectionIds':[x['sectionId'] for x in sections],'overallResult':overall,'humanReviewStatus':'PENDING_HUMAN','signatures':[],'status':'DRAFT_ONLY','anomalies':anomalies,'synthetic':True}
  payloads={
   'E1':{'request':{'product':request['productCode'],'date':str(start),'quantity':3,'conditions':conditions},'customer_spec':{'ref':spec,'conditions':conditions},'supervisor_endorsement':request['supervisorEndorsement'],'technical_review':'UNKNOWN'},
   'E2':{'trial_id':tid,'start_date':str(start),'duration_days':days,'granularity':'DAY','conditions':conditions,'samples':{'count':3,'volume_l':0.125},'required_devices':1,'equipment':[{'id':eid,'safe':True,'max_samples':12,'usable_volume_l':8,'conditions':equipment['conditions'],'ref':eref}],'reservations':[]},
   'E3':{'raw_data_ref':rawref,'raw_data_digest':digest(measurements),'measurements':measurements,'template_ref':template,'required_fields':{'report_id':rep,'trial_id':tid,'title':draft['title']},'original_result':overall},
   'E4':{'query':query,'documents':[{'ref':spec,'title':f'{sid} 合成規範','text':doctext}],'version_policy':'EXACT','fixture_only':True}}
  expected={'E1':{'status':'ADVISORY','recommendation':'REVIEW_REQUIRED','human_technical_review_status':'UNKNOWN'},'E2':{'status':'ADVISORY','proposalCount':1,'allocatedCount':3,'trialId':tid},'E3':{'status':'ADVISORY','original_result':overall,'withinDeclaredLimits':[d['result']=='PASS' for d in decisions]},'E4':{'status':'ADVISORY','retrieval_status':'FOUND','answer':doctext}}
  for engine,payload in payloads.items():
   inp={'engine_id':engine,'schema_version':'0.1.0-draft','correlation_id':f'SYNTH-COR-{i:03}-{engine}','request_id':rid,'request_payload':deepcopy(payload),'source_refs':[spec,eref,rawref,template]};case=f'{rid}-{engine}'
   D['engineInputs'].append({'caseId':case,'requestId':rid,'engineId':engine,'synthetic':True,'input':inp});D['engineExpectedResults'].append({'caseId':case,'expected':expected[engine],'synthetic':True})
  D['requests'].append(request);D['testResults'].append(result);D['reportDrafts'].append(draft);D['reportSections']+=sections;D['photoReferences']+=photos;D['equipment'].append(equipment)
  D['sourceProvenance'].append({'requestId':rid,'source':'SYNTHETIC','specRef':spec,'rawDataRef':rawref,'rawFileBytesSha256':rawsha,'nativeDigestKind':'CANONICAL_JSON_MEASUREMENTS_SHA256','rawDigestKind':'ORIGINAL_SYNTHETIC_FILE_BYTES_SHA256','capacityEvidence':{'sourceTrust':'SYNTHETIC_ONLY','sampleFixtureEnvelopeLitres':'0.125','usableVolumeLitres':'8','capacity':12,'configuration':equipment['configurationId'],'physicalLayoutEvidence':'SYNTHETIC_DECLARED_NOT_FORMAL_PROOF'},'catalogName':cat,'catalogSha256':catalog['sha256']})
 # Independent explicit failure/indeterminate fixtures; keep source case provenance.
 first={x['engineId']:x for x in D['engineInputs'] if x['requestId']=='SYNTH-REQ-001'}
 def negative(name,engine,modify,expected):
  x=json.loads(json.dumps(first[engine]));x['caseId']='NEG-'+name;modify(x['input']);D['engineInputs'].append(x);D['engineExpectedResults'].append({'caseId':x['caseId'],'expected':expected,'synthetic':True})
 negative('E1-MISSING','E1',lambda x:x['request_payload']['request'].pop('quantity'),{'status':'REJECTED','error':'MISSING_REQUIRED_FIELD'})
 negative('E1-DEVIATION','E1',lambda x:x['request_payload']['request']['conditions'].update(temperature_max=35),{'status':'ADVISORY','finding':'SPEC_DEVIATION'})
 negative('E2-MISSING','E2',lambda x:x['request_payload']['samples'].pop('volume_l'),{'status':'REJECTED','error':'MISSING_REQUIRED_FIELD'})
 negative('E2-CAPACITY','E2',lambda x:x['request_payload']['equipment'][0].update(max_samples=1),{'status':'ADVISORY','proposalCount':0,'internalDisposition':'INDETERMINATE'})
 negative('E2-TEMPERATURE','E2',lambda x:x['request_payload']['equipment'][0]['conditions'].update(temperature_max=10),{'status':'ADVISORY','proposalCount':0,'internalDisposition':'INDETERMINATE'})
 negative('E2-HUMIDITY','E2',lambda x:x['request_payload']['equipment'][0]['conditions'].update(humidity_max=30),{'status':'ADVISORY','proposalCount':0,'internalDisposition':'INDETERMINATE'})
 def conflict(x):
  p=x['request_payload'];p['reservations']=[{'equipment_id':p['equipment'][0]['id'],'start_date':p['start_date'],'expected_end_date':p['start_date'],'pickup_confirmed':False}]
 negative('E2-DATE-CONFLICT','E2',conflict,{'status':'ADVISORY','proposalCount':0,'internalDisposition':'INDETERMINATE'})
 negative('E3-MISSING','E3',lambda x:x['request_payload'].update(measurements=[]),{'status':'REJECTED','error':'MISSING_REQUIRED_FIELD'})
 negative('E4-NO-SOURCE','E4',lambda x:x['request_payload'].update(documents=[]),{'status':'ADVISORY','retrieval_status':'NOT_FOUND','answer':None})
 def versions(x):
  d=deepcopy(x['request_payload']['documents'][0]);d['ref']['version']='SYNTH-R2';x['request_payload']['documents'].append(d);x['source_refs'].append(d['ref'])
 negative('E4-VERSION-CONFLICT','E4',versions,{'status':'ADVISORY','retrieval_status':'VERSION_CONFLICT','answer':None})
 core=EngineCore()
 for case in D['engineInputs']:
  out=core.run(deepcopy(case['input']),actor_id='SYNTH-D-AI4-DATA',occurred_at='2026-11-09T09:00:00+08:00').to_dict()
  p=out['result_payload'];disposition='REJECTED' if out['status']=='REJECTED' else 'INDETERMINATE' if case['engineId']=='E2' and not p['proposals'] else 'REFUSED' if case['engineId']=='E4' and p['retrieval_status']!='FOUND' else 'SYNTHETIC_ADVISORY'
  D['engineExecutionEvidence'].append({'caseId':case['caseId'],'engineId':case['engineId'],'implementation':'existing ai_engine_core.service.EngineCore.run','output':out,'internalDisposition':disposition,'publicResult':None,'providerCalled':False,'formalCapacityVerified':False,'synthetic':True})
 for report in D['reportDrafts']:
  case=report['requestId']+'-E3';out=next(x['output'] for x in D['engineExecutionEvidence'] if x['caseId']==case)
  report['engineResultCaseId']=case;report['coreDraftData']=deepcopy(out['result_payload']['draft_data']);report['coreOutputDigest']=out['audit_metadata']['output_digest']
 write('data/competition_ai4_demo_dataset_v1.json',D)
 write('data/photo_asset_requirements_v1.json',{'version':'1.0','assets':D['photoReferences'],'imageFilesCreated':0})
 write('evidence/core-execution-results.json',D['engineExecutionEvidence'])
 return D
