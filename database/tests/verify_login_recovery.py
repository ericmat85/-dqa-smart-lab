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
REC='fa000000-0000-4000-8000-000000000001';KEEP='fa000000-0000-4000-8000-000000000010';OTHER='fa000000-0000-4000-8000-000000000011';FOREIGN='fa000000-0000-4000-8000-000000000012'
service='SET LOCAL ROLE service_role;'
seed=f"UPDATE auth.users SET email='recovery@example.invalid',email_confirmed_at=clock_timestamp() WHERE id='{U}';UPDATE dqa_business.memberships SET login_email='recovery@example.invalid' WHERE auth_user_id='{U}';"
def prepare(email='recovery@example.invalid',op=REC,client='a'):
 return f"SELECT dqa_business.prepare_password_recovery('{op}','{email}',repeat('{client}',64))"
sessions=f"INSERT INTO dqa_private.browser_sessions(id,auth_user_id,tenant_id,nonce_sha256,expires_at) VALUES('{KEEP}','{U}','{T}',repeat('a',64),clock_timestamp()+interval '1 hour'),('{OTHER}','{U}','{T}',repeat('b',64),clock_timestamp()+interval '1 hour'),('{FOREIGN}','10000000-0000-0000-0000-000000000002','{T}',repeat('c',64),clock_timestamp()+interval '1 hour');"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,message):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(message,r.stderr)
 def test_active_admin_closes_entry(self):self.ok(service+"SELECT dqa_business.public_account_entry_status()->>'activation_available'",'false')
 def test_no_active_admin_opens_entry(self):self.ok("UPDATE dqa_business.roles SET enabled=false WHERE is_tenant_admin;"+service+"SELECT dqa_business.public_account_entry_status()->>'activation_available'",'true')
 def test_anonymous_cannot_call_status_or_mail_rpc(self):
  for call in ['SELECT dqa_business.public_account_entry_status()',prepare()]:self.deny('SET LOCAL ROLE anon;'+call,'permission denied')
 def test_browser_cannot_call_server_mail_functions(self):self.deny(auth()+prepare(),'permission denied')
 def test_service_cannot_read_ledger_directly(self):self.deny(service+'SELECT * FROM dqa_private.password_recovery_requests','permission denied')
 def test_eligible_verified_member_dispatches(self):self.ok(seed+service+prepare()+"->>'dispatch'",'true')
 def test_absent_account_is_suppressed(self):self.ok(service+prepare(email='absent@example.invalid')+"->>'dispatch'",'false')
 def test_disabled_member_is_suppressed(self):self.ok(seed+f"UPDATE dqa_business.memberships SET enabled=false WHERE auth_user_id='{U}';"+service+prepare()+"->>'dispatch'",'false')
 def test_deleted_member_is_suppressed(self):self.ok(seed+f"UPDATE dqa_business.memberships SET enabled=false,deleted_at=clock_timestamp(),deleted_by=auth_user_id WHERE auth_user_id='{U}';"+service+prepare()+"->>'dispatch'",'false')
 def test_unverified_auth_identity_is_suppressed(self):self.ok(seed+f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{U}';"+service+prepare()+"->>'dispatch'",'false')
 def test_mismatched_member_auth_identity_is_suppressed(self):self.ok(seed+f"UPDATE dqa_business.memberships SET auth_user_id=NULL WHERE auth_user_id='{U}';"+service+prepare()+"->>'dispatch'",'false')
 def test_operation_replay_never_redispatches(self):self.ok(seed+service+prepare()+';'+prepare()+"->>'dispatch'",'false')
 def test_email_cooldown_suppresses_new_operation(self):self.ok(seed+service+prepare()+';'+prepare(op=OTHER)+"->>'dispatch'",'false')
 def test_invalid_email_or_client_hash_rejected(self):
  self.deny(service+prepare(email='bad'),'RECOVERY_FIELDS_INVALID');self.deny(service+prepare(client='x'),'RECOVERY_FIELDS_INVALID')
 def test_ledger_contains_hashes_only(self):self.ok(seed+service+prepare()+";RESET ROLE;SELECT email_hash=encode(sha256(convert_to('recovery@example.invalid','UTF8')),'hex') AND length(client_hash)=64 AND position('recovery@example.invalid' IN row_to_json(r)::text)=0 FROM dqa_private.password_recovery_requests r WHERE id='"+REC+"'",'t')
 def test_finish_is_terminal_and_does_not_redispatch(self):self.ok(seed+service+prepare()+f";SELECT dqa_business.finish_password_recovery('{REC}','SENT','ACCEPTED');SELECT dqa_business.finish_password_recovery('{REC}','FAILED','PROVIDER_REJECTED')",'f')
 def test_client_hourly_limit(self):
  q=';'.join(prepare(email=f'absent{i}@example.invalid',op=f'fb000000-0000-4000-8000-{i:012d}') for i in range(10));self.ok(seed+service+q+';'+prepare()+"->>'dispatch'",'false')
 def test_email_hourly_limit(self):
  q=seed
  for i in range(3):q+=service+prepare(op=f'fb000000-0000-4000-8000-{i:012d}')+";RESET ROLE;UPDATE dqa_private.password_recovery_requests SET created_at=clock_timestamp()-interval '61 seconds';"
  self.ok(q+service+prepare()+"->>'dispatch'",'false')
 def test_global_hourly_dispatch_limit(self):
  q="INSERT INTO dqa_private.password_recovery_requests(id,email_hash,client_hash,state) SELECT gen_random_uuid(),repeat('a',64),repeat('b',64),'UNKNOWN' FROM generate_series(1,10);";self.ok(seed+q+service+prepare()+"->>'dispatch'",'false')
 def test_revoke_other_own_sessions_preserves_other_user_and_current(self):self.ok(sessions+auth()+f"SELECT dqa_business.revoke_other_own_browser_sessions('{KEEP}');RESET ROLE;SELECT (SELECT revoked_at IS NULL FROM dqa_private.browser_sessions WHERE id='{KEEP}'),(SELECT revoked_at IS NOT NULL FROM dqa_private.browser_sessions WHERE id='{OTHER}'),(SELECT revoked_at IS NULL FROM dqa_private.browser_sessions WHERE id='{FOREIGN}')",'t|t|t')
 def test_cannot_keep_another_users_session(self):self.deny(sessions+auth()+f"SELECT dqa_business.revoke_other_own_browser_sessions('{FOREIGN}')",'AUTHENTICATION_REQUIRED')
 def test_anonymous_cannot_revoke_sessions(self):self.deny('SET LOCAL ROLE anon;'+f"SELECT dqa_business.revoke_other_own_browser_sessions('{KEEP}')",'permission denied')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'passed':r.wasSuccessful(),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
