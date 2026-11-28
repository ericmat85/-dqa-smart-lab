"""Node gateway proof -> installed PostgreSQL submission, synthetic rollback-only cases."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_human_workflow.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
import hmac,hashlib
W=Path(__file__).resolve().parents[2]
def node_proof(kind='REPORT',cookie=8,legacy=False,change=None):
 item={'id':UPLOAD if kind=='REPORT' else ARCHIVE,'sha256':'a'*64,'byte_size':128,'mime_type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' if kind=='REPORT' else 'application/pdf'}
 item.update(change or {})
 code="import {fileAttestation,attestationKey,reportAttestationKey} from './server/business/humanReports.mjs';import {readFileSync} from 'node:fs';const x=JSON.parse(readFileSync(0,'utf8')),env={BUSINESS_COOKIE_KEY:Buffer.alloc(32,x.cookie).toString('base64url'),BUSINESS_REPORT_ATTESTATION_KEY:Buffer.from(x.key,'hex').toString('base64url')};console.log(fileAttestation(x.legacy?attestationKey(env.BUSINESS_COOKIE_KEY).toString('base64url'):reportAttestationKey(env),x.item));"
 return subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps({'cookie':cookie,'key':KEY,'item':item,'legacy':legacy}),cwd=W,text=True).strip()
def supplied(proof):return f"RESET ROLE;SELECT set_config('dqa.test_proof','{proof}',true);"
class Tests(unittest.TestCase):
 def accept(self,sql):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def reject(self,sql):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn('HUMAN_FILE_VERIFICATION_REQUIRED',r.stderr[-2500:])
 def test_node_fixed_key_submits_to_real_database(self):
  self.accept(completed()+upload()+supplied(node_proof())+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True)+f"SELECT status='SUBMITTED' AND (SELECT count(*) FROM dqa_business.report_signatures WHERE report_version_id=r.current_version_id)=1 FROM dqa_business.reports r WHERE request_id='{REQ}';")
 def test_rotated_preview_cookie_does_not_change_submission_proof(self):
  a=node_proof(cookie=8);b=node_proof(cookie=91);self.assertEqual(a,b);self.accept(completed()+upload()+supplied(b)+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True)+f"SELECT status='SUBMITTED' FROM dqa_business.reports WHERE request_id='{REQ}';")
 def test_old_cookie_derived_proof_reproduces_reported_403(self):self.reject(completed()+upload()+supplied(node_proof(legacy=True))+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True))
 def test_tampered_upload_metadata_still_fails_database_verification(self):
  for change in [{'id':ARCHIVE},{'sha256':'b'*64},{'byte_size':129},{'mime_type':'application/pdf'}]:
   with self.subTest(change=change):self.reject(completed()+upload()+supplied(node_proof(change=change))+human('REPORT_SUBMIT',5,5,upload=UPLOAD,proof=True))
 def test_archival_pdf_uses_same_fixed_key_after_manual_approvals(self):
  self.accept(viewed()+upload('ARCHIVE',1,ARCHIVE)+supplied(node_proof('ARCHIVE',91))+human('CONFIRM_ARCHIVE',1,8,upload=ARCHIVE,proof=True)+f"SELECT status='CLOSED' FROM dqa_business.requests WHERE id='{REQ}';")
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'synthetic_only':True,'actual_postgresql_submission':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
