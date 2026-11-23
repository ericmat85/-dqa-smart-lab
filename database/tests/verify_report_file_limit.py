"""Rollback-only report upload size boundaries for REAL and VIRTUAL workflows."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_virtual_request_execution.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
class Tests(unittest.TestCase):
 def result(self,sql,real=False):return execute(sql,real)
 def large(self,size=20971520,who=5):return virtual_complete()+upload().replace("'SYNTHETIC.xlsx',128,",f"'SYNTHETIC.xlsx',{size},").replace(auth(5),auth(who))
 def test_exact_limit_allowed_for_virtual_and_real(self):
  for real in [False,True]:
   # The REAL fixture uses its normal server-time completion path.
   sql=(completed() if real else virtual_complete())+upload().replace("'SYNTHETIC.xlsx',128,","'SYNTHETIC.xlsx',20971520,")+f"RESET ROLE;SELECT byte_size FROM dqa_private.report_upload_intents WHERE id='{UPLOAD}'"
   r=self.result(sql,real);self.assertEqual(r.returncode,0,r.stderr[-1600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'20971520')
 def test_report_over_limit_is_denied(self):
  r=self.result(self.large(20971521));self.assertNotEqual(r.returncode,0);self.assertIn('HUMAN_FILE_INVALID',r.stderr)
 def test_empty_file_is_denied(self):
  r=self.result(self.large(0));self.assertNotEqual(r.returncode,0);self.assertIn('HUMAN_FILE_INVALID',r.stderr)
 def test_large_archive_uses_the_same_ceiling(self):
  sql=virtual_submitted()+human('REPORT_APPROVE',4,6)+human('REPORT_APPROVE',6,7)+upload('ARCHIVE',1,ARCHIVE).replace("'SYNTHETIC.pdf',128,","'SYNTHETIC.pdf',20971520,")+f"RESET ROLE;SELECT byte_size FROM dqa_private.report_upload_intents WHERE id='{ARCHIVE}'"
  r=self.result(sql);self.assertEqual(r.returncode,0,r.stderr[-1600:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'20971520')
 def test_private_bucket_and_grants_preserved(self):
  r=subprocess.run(cmd,input="SELECT file_size_limit,public,has_function_privilege('authenticated','dqa_business.prepare_report_upload(uuid,uuid,uuid,text,text,integer,text,bigint,bigint)','EXECUTE'),has_function_privilege('anon','dqa_business.prepare_report_upload(uuid,uuid,uuid,text,text,integer,text,bigint,bigint)','EXECUTE') FROM storage.buckets WHERE id='dqa-business-reports';",text=True,capture_output=True,env=env);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip(),'20971520|f|t|f')
 def test_non_executor_cannot_upload_larger_files(self):
  r=self.result(self.large(who=3));self.assertNotEqual(r.returncode,0);self.assertIn('HUMAN_ACCESS_DENIED',r.stderr)
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'cloud_mutations':False},indent=2));raise SystemExit(not r.wasSuccessful())
