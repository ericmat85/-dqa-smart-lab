"""Original UI draft contract, snapshot RLS and signature retention. Synthetic; rollback only."""
import argparse,base64,json,os,subprocess,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);args=p.parse_args();state=json.loads(Path(args.state).read_text());assert state['network']=='none'
env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',state['database']]
A='a0000000-0000-0000-0000-000000000001';B='b0000000-0000-0000-0000-000000000001';ID='ae000000-0000-0000-0000-000000000001'
AUTH="SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET LOCAL ROLE authenticated;"
GRANT="UPDATE dqa_business.roles SET permissions=array_append(permissions,'requests.draft') WHERE id='a1000000-0000-0000-0000-000000000002';"
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR0sAAAAASUVORK5CYII='
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
def create(data):return f"SELECT dqa_business.create_request_draft('{A}','{ID}','{json.dumps(data).replace(chr(39),chr(39)*2)}')"
class OriginalTests(unittest.TestCase):
 def ok(self,sql,last=None):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr)
  if last is not None:self.assertEqual(r.stdout.strip().splitlines()[-1],last)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def test_complete_original_form_and_signature_roundtrip(self):
  d={'form_details':{'testItems':['高溫高濕'],'sampleSource':['合成來源'],'project':'Original form','notes':'Draft notes'},'draft_signature_data':PNG};self.ok(GRANT+AUTH+create(d)+f";SELECT form_details->>'project',draft_signature_data='{PNG}',status FROM dqa_business.requests WHERE id='{ID}'",'Original form|t|DRAFT')
 def test_partial_update_preserves_original_details(self):self.ok(GRANT+AUTH+create({'form_details':{'notes':'Keep'},'draft_signature_data':PNG})+f";SELECT dqa_business.update_request_draft('{A}','{ID}',1,'{{\"purpose\":\"New\"}}');SELECT form_details->>'notes',draft_signature_data='{PNG}',revision FROM dqa_business.requests WHERE id='{ID}'",'Keep|t|2')
 def test_snapshot_omits_signature_and_auth_identity(self):self.ok(AUTH+f"SELECT (s->'requests'->0)?'draft_signature_data',(s->'members'->0)?'auth_user_id',s?'trials' FROM (SELECT dqa_business.original_ui_snapshot('{A}') s) q",'f|f|t')
 def test_snapshot_rejects_foreign_tenant(self):self.deny(AUTH+f"SELECT dqa_business.original_ui_snapshot('{B}')",'MEMBERSHIP_REQUIRED')
 def test_snapshot_invoker_rls(self):self.ok(AUTH+f"SELECT bool_and(value->>'tenant_id'='{A}') FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{A}')->'requests')",'t')
 def test_snapshot_anon_denied(self):self.deny('SET LOCAL ROLE anon;'+f"SELECT dqa_business.original_ui_snapshot('{A}')",'permission denied')
 def test_unknown_form_fields_rejected(self):self.deny(GRANT+AUTH+create({'form_details':{'role':'admin'}}),'ORIGINAL_FORM_INVALID')
 def test_array_type_and_items_rejected(self):
  for d in [{'testItems':{}},{'testItems':[{'bad':'object'}]},{'testItems':['x']*21},{'notes':['bad']}]:self.deny(GRANT+AUTH+create({'form_details':d}),'ORIGINAL_FORM_INVALID')
 def test_signature_mime_and_magic_rejected(self):
  for value in ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AAAA','data:image/jpeg;base64,AAAA',None]:self.deny(GRANT+AUTH+create({'draft_signature_data':value}),'DRAFT_SIGNATURE_INVALID')
 def test_signature_byte_limit(self):self.deny(GRANT+AUTH+create({'draft_signature_data':'data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'x'*1048576).decode()}),'DRAFT_SIGNATURE_INVALID')
 def test_snapshot_size_fails_instead_of_truncating(self):self.deny("INSERT INTO dqa_business.trial_definitions(tenant_id,legacy_id,name,source_kind,specification_version) SELECT '"+A+"','MASS-'||i,'Mass '||i,'MANUAL','SYNTHETIC-1' FROM generate_series(1,1001)i;"+AUTH+f"SELECT dqa_business.original_ui_snapshot('{A}')",'SNAPSHOT_PAGINATION_REQUIRED')
 def test_caller_cannot_write_directly(self):self.deny(AUTH+f"UPDATE dqa_business.requests SET draft_signature_data='{PNG}' WHERE tenant_id='{A}'",'permission denied')
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(OriginalTests));Path(args.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'synthetic_only':True},indent=2)+'\n');raise SystemExit(not result.wasSuccessful())
