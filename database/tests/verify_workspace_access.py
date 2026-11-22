"""Workspace access integration checks; accepts an isolated local Docker state only."""
import argparse,json,subprocess,os,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();state=json.loads(Path(a.state).read_text());assert state['network']=='none' and not state['published_ports'] and state['container'].startswith('dqa-business-local-');env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',state['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';R='a1000000-0000-0000-0000-000000000001';RID='ef000000-0000-4000-8000-000000000001';MID='ef000000-0000-4000-8000-000000000002';OP='ef000000-0000-4000-8000-000000000003';NU='ef000000-0000-4000-8000-000000000004'
def auth(u=U):return f"SET LOCAL request.jwt.claim.sub='{u}';SET LOCAL ROLE authenticated;"
def role(**changes):return dict(name='Synthetic reader',enabled=True,is_tenant_admin=False,permissions=['catalog.read'],systems=['lms'],pages=['dashboard'],review_level=0,**changes)
def member(**changes):
 d=dict(name='Synthetic member',email='pending@example.invalid',role_id=RID,department='Synthetic lab',supervisor_id=None,enabled=True);d.update(changes);return d
def save(kind='role',id=RID,rev=0,data=None,op=OP,t=T):
 data=data if data is not None else role();return f"SELECT dqa_business.save_workspace_access('{t}','{op}','{kind}','{id}',{rev},'{json.dumps(data).replace(chr(39),chr(39)*2)}'::jsonb);"
def run(sql):return subprocess.run(cmd,input="BEGIN;UPDATE auth.users SET email=coalesce(email,'local-'||replace(id::text,'-','')||'@example.invalid'),email_confirmed_at=clock_timestamp() WHERE id IN ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001');"+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
newrole=save();newmember=save('member',MID,data=member(),op='ef000000-0000-4000-8000-000000000005')
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,message):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(message,r.stderr)
 def test_admin_directory_includes_only_own_workspace(self):self.ok(auth()+f"SELECT jsonb_array_length(dqa_business.access_directory('{T}')->'members')",'3')
 def test_nonadmin_cannot_read_directory(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+f"SELECT dqa_business.access_directory('{T}')",'ACCESS_ADMIN_REQUIRED')
 def test_other_tenant_rejected(self):self.deny(auth()+save(t='b0000000-0000-0000-0000-000000000001'),'ACCESS_ADMIN_REQUIRED')
 def test_anon_cannot_execute(self):self.deny('SET LOCAL ROLE anon;'+newrole,'permission denied')
 def test_create_role_and_pending_member(self):self.ok(auth()+newrole+newmember+f"SELECT auth_user_id IS NULL,display_name FROM dqa_business.memberships WHERE id='{MID}'",'t|Synthetic member')
 def test_member_email_is_not_an_auth_password(self):self.deny(auth()+save('member',MID,data={**member(),'password':'Do not store passwords'}),'ACCESS_FIELDS_INVALID')
 def test_forged_permission_rejected(self):
  d=role();d['permissions']=['superuser'];self.deny(auth()+save(data=d),'ACCESS_FIELDS_INVALID')
 def test_duplicate_email_rejected(self):self.deny(auth()+newrole+newmember+save('member','ef000000-0000-4000-8000-000000000099',data=member(),op='ef000000-0000-4000-8000-000000000098'),'ACCESS_EMAIL_EXISTS')
 def test_role_revision_conflict(self):self.deny(auth()+newrole+save(rev=8,data=role(),op='ef000000-0000-4000-8000-000000000009'),'REVISION_CONFLICT')
 def test_member_revision_conflict(self):self.deny(auth()+newrole+newmember+save('member',MID,5,member(),op='ef000000-0000-4000-8000-000000000009'),'REVISION_CONFLICT')
 def test_repeated_operation_has_one_effect(self):self.ok(auth()+newrole+newrole+f"SELECT count(*) FROM dqa_business.roles WHERE id='{RID}'",'1')
 def test_operation_reuse_with_different_content_rejected(self):
  d=role();d['name']='Different';self.deny(auth()+newrole+save(data=d),'ACCESS_OPERATION_CONFLICT')
 def test_result_lookup(self):self.ok(auth()+newrole+f"SELECT dqa_business.access_operation_result('{T}','{OP}')->>'state'",'SAVED')
 def test_cannot_disable_self(self):
  d=member(email='local-'+U.replace('-','')+'@example.invalid',role_id=R,enabled=False);self.deny(auth()+save('member','a2000000-0000-0000-0000-000000000001',2,d),'ACCESS_SELF_LOCKOUT')
 def test_cannot_demote_own_admin_role(self):self.deny(auth()+save(id=R,rev=1,data=role()),'ACCESS_SELF_LOCKOUT')
 def test_unverified_email_cannot_claim_pending_membership(self):
  seed=f"INSERT INTO auth.users(id,email) VALUES('{NU}','pending@example.invalid');";self.ok(seed+auth()+newrole+newmember+f"SET LOCAL request.jwt.claim.sub='{NU}';SELECT dqa_business.claim_pending_memberships()",'0')
 def test_verified_email_claims_only_its_own_pending_member(self):
  seed=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());";self.ok(seed+auth()+newrole+newmember+f"SET LOCAL request.jwt.claim.sub='{NU}';SELECT dqa_business.claim_pending_memberships();SELECT count(*) FROM dqa_business.memberships WHERE auth_user_id='{NU}'",'1')
 def test_existing_verified_account_is_linked_without_email_or_password_change(self):
  seed=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());";self.ok(seed+auth()+newrole+newmember+f"SELECT auth_user_id='{NU}' FROM dqa_business.memberships WHERE id='{MID}'",'t')
 def test_disabling_member_revokes_durable_session(self):
  seed=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());";session=f"RESET ROLE;INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES(gen_random_uuid(),'{NU}','{T}',repeat('a',64),clock_timestamp()+interval '1 hour');";d=member(enabled=False);self.ok(seed+auth()+newrole+newmember+session+auth()+save('member',MID,1,d,op='ef000000-0000-4000-8000-000000000009')+f"RESET ROLE;SELECT bool_and(revoked_at IS NOT NULL) FROM dqa_private.browser_sessions WHERE auth_user_id='{NU}'",'t')
 def test_changing_role_revokes_assigned_member_session(self):
  seed=f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{NU}','pending@example.invalid',clock_timestamp());";session=f"RESET ROLE;INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES(gen_random_uuid(),'{NU}','{T}',repeat('a',64),clock_timestamp()+interval '1 hour');";d=role();d['permissions']=['catalog.read','equipment.read'];self.ok(seed+auth()+newrole+newmember+session+auth()+save(rev=1,data=d,op='ef000000-0000-4000-8000-000000000009')+f"RESET ROLE;SELECT bool_and(revoked_at IS NOT NULL) FROM dqa_private.browser_sessions WHERE auth_user_id='{NU}'",'t')
 def test_private_operation_journal_not_readable(self):self.deny(auth()+'SELECT * FROM dqa_private.access_operations','permission denied')
 def test_no_direct_client_member_write(self):self.deny(auth()+'UPDATE dqa_business.memberships SET enabled=false','permission denied')
 def test_case_gate_still_closed(self):self.deny(auth()+"UPDATE dqa_business.requests SET status='RUNNING'",'permission denied')
 def test_report_grant_reads_reports_without_exposing_other_requests(self):self.ok("INSERT INTO dqa_business.reports(id,tenant_id,request_id) VALUES('ac000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000002');INSERT INTO dqa_business.report_versions(id,tenant_id,report_id,request_id,version,artifact_id,artifact_version_id) VALUES('ad000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000002',1,'aa000000-0000-0000-0000-000000000002','ab000000-0000-0000-0000-000000000002');UPDATE dqa_business.roles SET permissions=array_append(permissions,'reports.read_all') WHERE id='a1000000-0000-0000-0000-000000000002';"+auth('10000000-0000-0000-0000-000000000002')+"SELECT (SELECT count(*) FROM dqa_business.requests),(SELECT count(*) FROM dqa_business.report_versions),(SELECT count(*) FROM dqa_business.artifact_versions)",'1|2|2')
 def test_foreign_role_cannot_be_assigned(self):self.deny(auth()+save('member',MID,data=member(role_id='b1000000-0000-0000-0000-000000000001')),'ACCESS_ROLE_UNAVAILABLE')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'passed':r.wasSuccessful(),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
