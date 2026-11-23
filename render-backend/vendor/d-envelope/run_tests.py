import sys,os,json,unittest
from pathlib import Path
O=Path(__file__).resolve().parent;sys.dont_write_bytecode=True;sys.path[:0]=[str(O),str(O/'p02_reference'),str(O/'runtime')]
def audit(event,args):
 if event.startswith('socket.') or event in ('subprocess.Popen','os.system'):raise RuntimeError('OFFLINE_ONLY')
 if event=='open':
  path,mode,flags=args;w=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_APPEND|os.O_TRUNC)
  if w and not Path(path).resolve().is_relative_to(O):raise RuntimeError('WRITE_OUTSIDE_ISOLATION')
sys.addaudithook(audit)
class Result(unittest.TextTestResult):
 def __init__(self,*a,**kw):super().__init__(*a,**kw);self.rows=[]
 def addSuccess(self,t):super().addSuccess(t);self.rows.append({'id':t.id(),'status':'CURRENT_PASS'})
 def addFailure(self,t,e):super().addFailure(t,e);self.rows.append({'id':t.id(),'status':'CURRENT_FAIL'})
 def addError(self,t,e):super().addError(t,e);self.rows.append({'id':t.id(),'status':'CURRENT_FAIL','type':'ERROR'})
 def addSkip(self,t,reason):super().addSkip(t,reason);self.rows.append({'id':t.id(),'status':'NOT_RUN','reason':reason})
reports=[]
for name,folder in [('P04','tests'),('P02','p02_reference/tests')]:
 suite=unittest.TestLoader().discover(str(O/folder));r=unittest.TextTestRunner(verbosity=1,resultclass=Result).run(suite)
 reports.append({'suite':name,'tests':r.testsRun,'pass':r.testsRun-len(r.failures)-len(r.errors)-len(r.skipped),'fail':len(r.failures),'error':len(r.errors),'skip':len(r.skipped),'cases':r.rows,'failure_details':[{'id':t.id(),'trace':trace} for t,trace in r.failures+r.errors]})
report={'mode':'ISOLATED_SYNTHETIC_DIRECT_FUNCTION_ONLY','suites':reports,'historical_full_52':'BLOCKED_NOT_RUN; historical external receipt/guard missing','provider':'NOT_RUN','API_DB':'NOT_RUN'}
(O/'evidence/test-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([{k:v for k,v in r.items() if k not in ('cases','failure_details')} for r in reports]));sys.exit(any(r['fail'] or r['error'] for r in reports))
