import sys,os,json,unittest,hashlib
from pathlib import Path
O=Path(__file__).resolve().parent;sys.dont_write_bytecode=True;sys.path[:0]=[str(O),str(O/'runtime')]
def audit(event,args):
 if event.startswith('socket.') or event in ('subprocess.Popen','os.system'):raise RuntimeError('OFFLINE_ONLY')
 if event=='open':
  p,mode,flags=args;w=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_APPEND|os.O_TRUNC)
  if w and not Path(p).resolve().is_relative_to(O):raise RuntimeError('WRITE_OUTSIDE_ISOLATION')
sys.addaudithook(audit)
from build_cases import cases
from dynamic_adapter import run,number
from ai_engine_core.service import EngineCore
D,C=cases();observed=[]
def prof(frame,event,arg):
 if event=='call' and frame.f_code is EngineCore.run.__code__:observed.append(frame.f_locals['raw']['engine_id'])
old=sys.getprofile();sys.setprofile(prof)
trace=[{**c,'output':run(c['raw'],c['context'])} for c in C]
(O/'evidence/dynamic-input-output-trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
audit_rows=[]
for result in D['testResults']:
 for row in result['rawMeasurements']:
  try:number(row['value'],row['unit']);state='FORMAT_VALID';reason=None
  except ValueError as e:state='REQUIRES_EXPLICIT_SOURCE_CORRECTION';reason=str(e)
  audit_rows.append({'sourceRequestId':result['requestId'],'measurementId':row['measurementId'],'originalValue':row['value'],'unit':row['unit'],'state':state,'reason':reason,'mutated':False})
(O/'evidence/legacy-numeric-format-audit.json').write_text(json.dumps(audit_rows,ensure_ascii=False,indent=2)+'\n')
class Result(unittest.TextTestResult):
 def __init__(self,*a,**kw):super().__init__(*a,**kw);self.rows=[]
 def addSuccess(self,t):super().addSuccess(t);self.rows.append({'id':t.id(),'status':'CURRENT_PASS'})
 def addFailure(self,t,e):super().addFailure(t,e);self.rows.append({'id':t.id(),'status':'CURRENT_FAIL'})
 def addError(self,t,e):super().addError(t,e);self.rows.append({'id':t.id(),'status':'ERROR'})
 def addSkip(self,t,why):super().addSkip(t,why);self.rows.append({'id':t.id(),'status':'NOT_RUN','reason':why})
r=unittest.TextTestRunner(verbosity=1,resultclass=Result).run(unittest.TestLoader().discover(str(O/'tests')));sys.setprofile(old)
report={'tests_run':r.testsRun,'pass':r.testsRun-len(r.failures)-len(r.errors)-len(r.skipped),'fail':len(r.failures),'error':len(r.errors),'skip':len(r.skipped),'cases':r.rows,'failure_details':[{'id':t.id(),'trace':v} for t,v in r.failures+r.errors],'dynamic_cases':len(trace),'observed_actual_core_calls':len(observed),'calls_by_engine':{e:observed.count(e) for e in ['E1','E2','E3','E4']},'provider':'NOT_RUN','registry_required':False,'legacy_format_gaps':sum(r['state']!='FORMAT_VALID' for r in audit_rows)}
(O/'evidence/test-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('cases','failure_details')}));sys.exit(not r.wasSuccessful())
