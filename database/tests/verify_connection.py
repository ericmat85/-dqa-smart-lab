"""Synthetic PostgreSQL checks for the connection RPCs; every test rolls back."""
import argparse,json,os,subprocess,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);p.add_argument('--database');args=p.parse_args();state=json.loads(Path(args.state).read_text());assert state['network']=='none' and state['container'].startswith('dqa-business-local-')
env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',args.database or state['database']]
A='a0000000-0000-0000-0000-000000000001';B='b0000000-0000-0000-0000-000000000001';UID='10000000-0000-0000-0000-000000000002';ID='ae000000-0000-0000-0000-000000000001';SID='af000000-0000-0000-0000-000000000001'
AUTH=f"SET LOCAL request.jwt.claim.sub='{UID}'; SET LOCAL ROLE authenticated;"
GRANT="UPDATE dqa_business.roles SET permissions=array_append(permissions,'requests.draft') WHERE id='a1000000-0000-0000-0000-000000000002';"
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class ConnectionTests(unittest.TestCase):
 def ok(self,sql,expected=None):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr)
  if expected is not None:self.assertEqual(r.stdout.strip(),expected)
 def last(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,code):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(code,r.stderr)
 def create(self,data='{}'):return f"SELECT dqa_business.create_request_draft('{A}','{ID}','{data}')"
 def test_no_implicit_draft_permission(self):self.deny(AUTH+self.create(),'DRAFT_WRITE_DENIED')
 def test_owner_and_draft_status_are_server_derived(self):self.ok(GRANT+AUTH+f"SELECT v->>'status',v->>'owner_member_id' FROM ({self.create()} AS v) q",'DRAFT|a2000000-0000-0000-0000-000000000002')
 def test_reject_caller_role_status_owner(self):
  for key in ['status','owner_member_id','tenant_id','revision','role']:
   self.deny(GRANT+AUTH+self.create(json.dumps({key:'FORGED'})),'DRAFT_FIELDS_INVALID')
 def test_foreign_tenant(self):self.deny(GRANT+AUTH+f"SELECT dqa_business.create_request_draft('{B}','{ID}','{{}}')",'DRAFT_WRITE_DENIED')
 def test_cross_tenant_trial(self):self.deny(GRANT+AUTH+self.create(json.dumps({'trial_id':'b3000000-0000-0000-0000-000000000001'})),'TRIAL_NOT_AVAILABLE')
 def test_duplicate_draft_does_not_reapply(self):self.deny(GRANT+AUTH+self.create()+';'+self.create(),'DRAFT_ID_ALREADY_EXISTS_READ_BEFORE_RETRY')
 def test_revision_conflict_does_not_overwrite(self):self.deny(GRANT+AUTH+self.create()+f";SELECT dqa_business.update_request_draft('{A}','{ID}',99,'{{\"purpose\":\"bad\"}}')",'REVISION_CONFLICT')
 def test_update_only_owned_draft(self):self.deny(GRANT+AUTH+f"SELECT dqa_business.update_request_draft('{A}','a6000000-0000-0000-0000-000000000002',1,'{{}}')",'DRAFT_NOT_AVAILABLE')
 def test_successful_update_increments_revision(self):self.last(GRANT+AUTH+self.create()+f";SELECT dqa_business.update_request_draft('{A}','{ID}',1,'{{\"purpose\":\"new\"}}')->>'revision'",'2')
 def test_context_only_own_membership(self):self.ok(AUTH+"SELECT jsonb_array_length(dqa_business.connection_context()->'memberships')",'1')
 def session(self):return f"SELECT dqa_business.open_browser_session('{A}','{SID}',repeat('a',64))"
 def test_session_secret_and_user_binding(self):self.last(AUTH+self.session()+f";SELECT dqa_business.check_browser_session('{SID}',repeat('b',64)) IS NULL",'t')
 def test_revocation_is_durable(self):self.last(AUTH+self.session()+f";SELECT dqa_business.revoke_browser_session('{SID}',repeat('a',64));SELECT dqa_business.check_browser_session('{SID}',repeat('a',64)) IS NULL",'t')
 def test_other_identity_cannot_reuse_session(self):self.last(AUTH+self.session()+f";RESET ROLE; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;SELECT dqa_business.check_browser_session('{SID}',repeat('a',64)) IS NULL",'t')
 def test_private_session_table_not_readable(self):self.deny(AUTH+'SELECT * FROM dqa_private.browser_sessions','permission denied')
 def test_anon_cannot_call_connection_rpcs(self):self.deny('SET LOCAL ROLE anon;SELECT dqa_business.connection_context()','permission denied')
 def test_database_manages_workflow_gate(self):self.deny(AUTH+f"UPDATE dqa_business.requests SET status='RUNNING' WHERE tenant_id='{A}'",'permission denied')
 def test_rpc_public_acl(self):self.ok("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_business' AND has_function_privilege('anon',p.oid,'EXECUTE')",'0')
 def test_invalid_numeric_inputs(self):
  for value in [0,-1,1.5,'2',True]:self.deny(GRANT+AUTH+self.create(json.dumps({'quantity':value})),'DRAFT_FIELDS_INVALID')
result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ConnectionTests));Path(args.result).write_text(json.dumps({'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'synthetic_only':True},indent=2)+'\n');raise SystemExit(not result.wasSuccessful())
