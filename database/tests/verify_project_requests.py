"""Atomic project requests, using synthetic data in a network-isolated local DB."""
import argparse,json,subprocess,os,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'];env={k:v for k,v in os.environ.items() if not k.startswith('DOCKER_')};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';G='eb000000-0000-4000-8000-000000000001';SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII='
def auth(i=2):return f"SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-{i:012}';SET LOCAL ROLE authenticated;"
def literal(v):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
def command(n=70,submit=True):return dict(name='合成專案',execution_kind='REAL',submit=submit,common=dict(product_code='SYNTHETIC',customer_name='SYNTHETIC',purpose='合成驗證',requested_date='2027-01-08',form_details={'purpose':['合成驗證']},draft_signature_data=SIG),items=[dict(trial_id='a3000000-0000-0000-0000-000000000001',name='Synthetic humidity',quantity=i+1,specification=f'試驗時間：250 小時。分項{i+1}',acceptance=f'合成判定{i+1}',judgementRequired='需作判定') for i in range(n)])
def fixture():return f"""UPDATE dqa_private.request_workflow_policy SET enabled=true WHERE tenant_id='{T}';UPDATE dqa_business.roles SET permissions=ARRAY(SELECT DISTINCT v FROM unnest(permissions||ARRAY['requests.draft','requests.submit']) v) WHERE id='a1000000-0000-0000-0000-000000000002';UPDATE dqa_business.memberships SET supervisor_member_id='a2000000-0000-0000-0000-000000000001' WHERE id='a2000000-0000-0000-0000-000000000002';"""
def prepare(c=None):return auth()+f"SELECT dqa_business.prepare_project_request('{T}','{G}',{literal(c or command())});"
def execute(c=None):return auth()+f"SELECT dqa_business.execute_project_request('{T}','{G}',{literal(c or command())});"
def query(sql):return subprocess.run(cmd,input='BEGIN;'+fixture()+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=query(sql);self.assertEqual(r.returncode,0,r.stderr[-2200:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=query(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr[-2200:])
 def test_70_submit_each_ordinary_workflow(self):self.ok(prepare()+execute()+f"SELECT count(*),count(DISTINCT quantity),count(DISTINCT specification),bool_and(status='AWAITING_REQUEST_MANAGER'),min(project_item_index),max(project_item_index) FROM dqa_business.requests WHERE project_group_id='{G}'",'70|70|70|t|1|70')
 def test_100_submit_and_signatures(self):
  c=command(100);self.ok(prepare(c)+execute(c)+f"SELECT count(*),count(DISTINCT document_version_id) FROM dqa_business.request_signatures WHERE request_id IN(SELECT id FROM dqa_business.requests WHERE project_group_id='{G}')",'100|100')
 def test_70_drafts(self):
  c=command(70,False);self.ok(prepare(c)+execute(c)+f"SELECT count(*),bool_and(status='DRAFT') FROM dqa_business.requests WHERE project_group_id='{G}'",'70|t')
 def test_replay_does_not_duplicate(self):self.ok(prepare()+execute()+execute()+f"SELECT count(*) FROM dqa_business.requests WHERE project_group_id='{G}'",'70')
 def test_101_rejected(self):self.deny(prepare(command(101)),'PROJECT_LIMIT')
 def test_zero_rejected(self):self.deny(prepare(command(0)),'PROJECT_LIMIT')
 def test_unknown_fields_rejected(self):self.deny(prepare({**command(),'status':'CLOSED'}),'PROJECT_FIELDS_INVALID')
 def test_unknown_trial(self):
  c=command();c['items'][69]['trial_id']='a3000000-0000-0000-0000-000000000099';self.deny(prepare(c),'TRIAL_NOT_AVAILABLE')
 def test_payload_substitution(self):
  c=command();c['items'][0]['quantity']=500;self.deny(prepare()+execute(c),'PROJECT_OPERATION_CONFLICT')
 def test_atomic_failure_no_partial_children(self):
  # Invalid signatures leave the prepared intent with no committed children.
  c=command();c['common']['draft_signature_data']='';self.ok(prepare(c)+"DO $x$ BEGIN BEGIN PERFORM dqa_business.execute_project_request('"+T+"','"+G+"',"+literal(c)+");RAISE EXCEPTION 'EXPECTED_FAILURE_MISSING';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'WORKFLOW_SIGNATURE_REQUIRED' THEN RAISE;END IF;END;END $x$;RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.requests WHERE project_group_id='"+G+"'),(SELECT state FROM dqa_private.project_request_operations WHERE id='"+G+"')",'0|PLANNED')
 def test_actor_cannot_read_other_operation(self):self.ok(prepare()+auth(1)+f"SELECT dqa_business.project_request_result('{T}','{G}')->>'state'",'NOT_FOUND')
 def test_cross_tenant_denied(self):self.deny(prepare().replace(T,'b0000000-0000-0000-0000-000000000001'),'DRAFT_WRITE_DENIED')
 def test_snapshot_links(self):self.ok(prepare()+execute()+f"SELECT count(*) FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{T}')->'requests') r WHERE r->>'project_group_id'='{G}'",'70')
 def test_supervisor_email_present(self):self.ok(auth()+f"SELECT dqa_business.request_supervisor('{T}')->0->>'login_email'",'local-10000000000000000000000000000001@example.invalid')
 def test_supervisor_is_not_directory(self):self.ok(auth()+f"SELECT jsonb_array_length(dqa_business.request_supervisor('{T}'))",'1')
 def test_private_intent_no_signature(self):self.ok(prepare()+f"RESET ROLE;SELECT command ? 'common' FROM dqa_private.project_request_operations WHERE id='{G}'",'f')
 def test_direct_project_draft_forgery_blocked(self):
  c=command(1);d={**c['common'],'trial_id':c['items'][0]['trial_id'],'quantity':1,'specification':'test','acceptance':'test','form_details':{'priority':'專案'}};self.deny(auth()+f"SELECT dqa_business.create_classified_request_draft('{T}','{G}',{literal(d)},'REAL')",'PROJECT_GROUP_REQUIRED')
 def test_failure_at_child_70_rolls_back_first_69_submissions(self):
  trigger="""CREATE FUNCTION dqa_private.synthetic_project_failure() RETURNS trigger LANGUAGE plpgsql AS $t$ BEGIN IF NEW.project_item_index=70 THEN RAISE EXCEPTION 'PROJECT_SYNTHETIC_FAILURE';END IF;RETURN NEW;END $t$;CREATE TRIGGER synthetic_project_failure AFTER INSERT ON dqa_business.requests FOR EACH ROW EXECUTE FUNCTION dqa_private.synthetic_project_failure();"""
  self.ok(trigger+prepare()+"DO $x$ BEGIN BEGIN PERFORM dqa_business.execute_project_request('"+T+"','"+G+"',"+literal(command())+");RAISE EXCEPTION 'EXPECTED_FAILURE_MISSING';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROJECT_SYNTHETIC_FAILURE' THEN RAISE;END IF;END;END $x$;RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.requests WHERE project_group_id='"+G+"'),(SELECT count(*) FROM dqa_business.request_projects WHERE id='"+G+"'),(SELECT state FROM dqa_private.project_request_operations WHERE id='"+G+"')",'0|0|PLANNED')
 def test_linked_child_is_individually_editable(self):
  c=command(70,False);self.ok(prepare(c)+execute(c)+f"SELECT dqa_business.update_request_draft('{T}',(SELECT id FROM dqa_business.requests WHERE project_group_id='{G}' AND project_item_index=70),1,'{{\"quantity\":99}}');SELECT quantity,project_item_index FROM dqa_business.requests WHERE project_group_id='{G}' AND project_item_index=70",'99|70')
 def test_group_kind_cannot_be_removed(self):
  c=command(1,False);self.deny(prepare(c)+execute(c)+f"SELECT dqa_business.update_request_draft('{T}',(SELECT id FROM dqa_business.requests WHERE project_group_id='{G}'),1,'{{\"form_details\":{{\"priority\":\"一般\"}}}}')",'PROJECT_LINK_IMMUTABLE')
 def test_cross_tenant_project_names_not_visible(self):self.ok(prepare()+execute()+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';SET LOCAL ROLE authenticated;SELECT count(*) FROM dqa_business.request_projects",'0')
 def test_prepare_expiry_prevents_late_children(self):self.deny(prepare()+f"RESET ROLE;UPDATE dqa_private.project_request_operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='{G}';"+execute(),'PROJECT_OPERATION_EXPIRED')
 def test_100_project_submissions_work_after_regular_rate_is_used(self):
  seed=f"INSERT INTO dqa_private.request_operations(tenant_id,id,actor_id,fingerprint) SELECT '{T}',md5('synthetic-rate-'||n)::uuid,'10000000-0000-0000-0000-000000000002',repeat('a',64) FROM generate_series(1,100) n;"
  c=command(100);self.ok(seed+prepare(c)+execute(c)+f"SELECT count(*) FROM dqa_business.requests WHERE project_group_id='{G}'",'100')
 def test_project_internal_rate_exception_is_not_publicly_executable(self):self.deny(auth()+f"SELECT dqa_private.project_batch_allowed('{T}','{G}','{G}')",'permission denied')
 def test_regular_workflow_rate_still_enforced(self):
  c=command(1,False);seed=f"RESET ROLE;INSERT INTO dqa_private.request_operations(tenant_id,id,actor_id,fingerprint) SELECT '{T}',md5('synthetic-rate-'||n)::uuid,'10000000-0000-0000-0000-000000000002',repeat('a',64) FROM generate_series(1,100) n;"
  self.deny(prepare(c)+execute(c)+seed+auth()+f"SELECT dqa_business.prepare_request_operation('{T}','eb000000-0000-4000-8000-000000000099',jsonb_build_object('request_id',(SELECT id FROM dqa_business.requests WHERE project_group_id='{G}'),'expected_revision',1,'action','SUBMIT','signature_data','{SIG}','comment',''))",'WORKFLOW_RATE_LIMITED')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
