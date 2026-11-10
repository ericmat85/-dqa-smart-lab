import sys,os,json,unittest
from pathlib import Path
O=Path(__file__).resolve().parent;sys.dont_write_bytecode=True;sys.path[:0]=[str(O),str(O/'runtime')]
def audit(event,args):
 if event.startswith('socket.') or event in ('subprocess.Popen','os.system'):raise RuntimeError('OFFLINE_ONLY')
 if event=='open':
  path,mode,flags=args;w=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_APPEND|os.O_TRUNC)
  if w and not Path(path).resolve().is_relative_to(O):raise RuntimeError('WRITE_OUTSIDE_ISOLATION')
sys.addaudithook(audit)
from build_dataset import build,write
from ai_engine_core.service import EngineCore
core_calls=[]
def profile(frame,event,arg):
 if event=='call' and frame.f_code is EngineCore.run.__code__:core_calls.append(frame.f_locals['raw'].get('engine_id'))
prior_profile=sys.getprofile();sys.setprofile(profile)
D=build()
from validate_dataset import validate
from a_import_adapter import prepare_import
validate(D);write('data/a_staging_import_v1.json',prepare_import(D))
class Result(unittest.TextTestResult):
 def __init__(self,*a,**kw):super().__init__(*a,**kw);self.rows=[]
 def addSuccess(self,t):super().addSuccess(t);self.rows.append({'id':t.id(),'status':'CURRENT_PASS'})
 def addFailure(self,t,e):super().addFailure(t,e);self.rows.append({'id':t.id(),'status':'CURRENT_FAIL'})
 def addError(self,t,e):super().addError(t,e);self.rows.append({'id':t.id(),'status':'ERROR'})
 def addSkip(self,t,why):super().addSkip(t,why);self.rows.append({'id':t.id(),'status':'NOT_RUN','reason':why})
r=unittest.TextTestRunner(verbosity=1,resultclass=Result).run(unittest.TestLoader().discover(str(O/'tests')))
sys.setprofile(prior_profile)
report={'task':'D-COMP-1111-AI4-DATA-P02','tests_run':r.testsRun,'pass':r.testsRun-len(r.failures)-len(r.errors)-len(r.skipped),'fail':len(r.failures),'error':len(r.errors),'skip':len(r.skipped),'cases':r.rows,'failure_details':[{'id':t.id(),'trace':v} for t,v in r.failures+r.errors],'fixture_engine_cases':len(D['engineExecutionEvidence']),'observed_actual_core_calls':len(core_calls),'observed_by_engine':{e:core_calls.count(e) for e in ['E1','E2','E3','E4']},'mode':'ACTUAL_RULE_CORE_NO_PROVIDER','API_DB':'NOT_RUN'}
write('evidence/test-results.json',report);print(json.dumps({k:v for k,v in report.items() if k not in ('cases','failure_details')}));sys.exit(not r.wasSuccessful())
