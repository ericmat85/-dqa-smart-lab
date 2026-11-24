"""Finance boundary tests on a network-isolated local PostgreSQL container. No DSN supported."""
import argparse,json,subprocess,os,unittest,uuid,base64,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();state=json.loads(Path(a.state).read_text());assert state['network']=='none' and not state['published_ports'] and state['container'].startswith('dqa-business-local-')
env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',state['database']]
T='a0000000-0000-0000-0000-000000000001';B='b0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';OTHER='10000000-0000-0000-0000-000000000002';E='a4000000-0000-0000-0000-000000000001';P='fc000000-0000-4000-8000-000000000001';REQ=str(uuid.UUID(hashlib.md5(('project-item:'+P+':1').encode()).hexdigest()))
def uid():return str(uuid.uuid4())
def auth(u=U):return f"SET LOCAL request.jwt.claim.sub='{u}';SET LOCAL ROLE authenticated;"
def js(d):return "'"+json.dumps(d).replace("'","''")+"'::jsonb"
def cost(**kw):return dict(dict(occurred_on='2026-01-01',phase='ACTUAL',category='OTHER',scope='WORKSPACE',iteration=1,nature='EXTERNAL',currency='TWD',pricing='FIXED',amount=2000),**kw)
def voucher(ids,**kw):return dict(dict(supplier='Synthetic vendor',kind='INVOICE',number='SYN-001',occurred_on='2026-01-01',currency='TWD',amount=6000,finance_number='F-SYN-001',cost_ids=ids),**kw)
def save(d=None,id=None,kind='cost',rev=0,op=None,void=False,t=T):return f"SELECT dqa_business.finance_save('{t}','{op or uid()}','{kind}','{id or uid()}',{rev},{js(d if d is not None else cost())},{str(void).lower()});"
def snap(filter={}):return f"dqa_business.finance_snapshot('{T}',{js(filter)})"
def run(sql):return subprocess.run(cmd,input="BEGIN;UPDATE auth.users SET email=coalesce(email,'local-'||replace(id::text,'-','')||'@example.invalid'),email_confirmed_at=clock_timestamp();"+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
def project():
 c=dict(name='Synthetic project',execution_kind='REAL',submit=False,common=dict(product_code='SYNTHETIC',customer_name='SYNTHETIC',purpose='Synthetic',requested_date='2027-01-08',form_details={}),items=[dict(trial_id='a3000000-0000-0000-0000-000000000001',name='Synthetic humidity',quantity=1,specification='250 小時',acceptance='Synthetic',judgementRequired='需作判定')])
 return auth()+f"SELECT dqa_business.prepare_project_request('{T}','{P}',{js(c)});SELECT dqa_business.execute_project_request('{T}','{P}',{js(c)});RESET ROLE;"

def role(write=False,page=True):return "UPDATE dqa_business.roles SET permissions=ARRAY['finance.read'"+(",'finance.write'" if write else '')+"],pages=ARRAY['dashboard'"+(",'finance'" if page else '')+"] WHERE tenant_id='"+T+"' AND id='a1000000-0000-0000-0000-000000000002';"
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,message):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(message,r.stderr)
 def test_admin_read_and_empty_not_zero(self):self.ok(auth()+f"SELECT {snap()}->'totals'",'[]')
 def test_other_workspace_denied(self):self.deny(auth()+f"SELECT dqa_business.finance_context('{B}')",'FINANCE_ACCESS_DENIED')
 def test_nonfinance_member_denied(self):self.deny(auth(OTHER)+f"SELECT {snap()}",'FINANCE_ACCESS_DENIED')
 def test_read_only_cannot_write(self):self.deny(role()+auth(OTHER)+save(),'FINANCE_ACCESS_DENIED')
 def test_read_only_can_read(self):self.ok(role()+auth(OTHER)+f"SELECT {snap()}->'count'",'0')
 def test_page_required(self):self.deny(role(True,False)+auth(OTHER)+save(),'FINANCE_ACCESS_DENIED')
 def test_write_role_can_save(self):self.ok(role(True)+auth(OTHER)+save()+f"SELECT {snap()}->'count'",'1')
 def test_direct_table_denied(self):self.deny(auth()+'SELECT * FROM dqa_private.finance_costs','permission denied')
 def test_anon_denied(self):self.deny('SET LOCAL ROLE anon;'+save(),'permission denied')
 def test_unknown_amount_not_zero(self):self.ok(auth()+save(cost(amount=None))+f"SELECT {snap()}->'totals'->0->>'unestimated',{snap()}->'totals'->0->>'known_amount'",'1|')
 def test_negative_rejected(self):self.deny(auth()+save(cost(amount=-1)),'check constraint')
 def test_nan_rejected(self):self.deny(auth()+save(cost(amount='NaN')),'check constraint')
 def test_reserved_day_is_not_billed(self):self.ok(auth()+save(cost(category='EQUIPMENT',equipment_kind='USE',equipment_id=E,scope='EQUIPMENT',phase='ESTIMATE',pricing='RATE',rate_label='Standard synthetic',rate=100,planned_test_hours=1,reserved_hours=24))+f"SELECT {snap()}->'totals'->0->>'known_amount'",'100.00')
 def test_actual_uses_confirmed_not_planned(self):self.ok(auth()+save(cost(category='EQUIPMENT',equipment_kind='USE',equipment_id=E,scope='EQUIPMENT',pricing='RATE',rate_label='Standard',rate=100,planned_test_hours=9,reserved_hours=24,confirmed_run_hours=2))+f"SELECT {snap()}->'totals'->0->>'known_amount'",'200.00')
 def test_labor_uses_labor_hours(self):self.ok(auth()+save(cost(category='LABOR',pricing='RATE',rate_label='Role standard',rate=100,labor_hours=3,reserved_hours=24))+f"SELECT {snap()}->'totals'->0->>'known_amount'",'300.00')
 def test_missing_confirmed_hours_not_zero(self):self.ok(auth()+save(cost(category='EQUIPMENT',equipment_kind='USE',equipment_id=E,pricing='RATE',rate_label='Standard',rate=100,planned_test_hours=1,reserved_hours=24))+f"SELECT {snap()}->'totals'->0->>'unestimated'",'1')
 def test_year_includes_more_than_200_rows(self):self.ok(auth()+''.join(save(cost(amount=1)) for _ in range(211))+f"SELECT {snap({'year':2026})}->'annual'->0->>'known_amount',jsonb_array_length({snap()}->'costs'),{snap()}->>'count'",'211.00|50|211')
 def test_request_project_not_double_counted(self):self.ok(project()+auth()+save(cost(scope='CASE',request_id=REQ,project_id=P))+f"SELECT {snap({'project_id':P,'year':2026})}->'annual'->0->>'known_amount'",'2000.00')
 def test_routine_equipment_cannot_direct_charge_project(self):self.deny(project()+auth()+save(cost(scope='EQUIPMENT',equipment_id=E,project_id=P)),'check constraint')
 def test_currency_separate(self):self.ok(auth()+save()+save(cost(currency='USD'))+f"SELECT jsonb_array_length({snap()}->'totals')",'2')
 def test_estimate_actual_and_internal_external_separate(self):self.ok(auth()+save()+save(cost(phase='ESTIMATE'))+save(cost(nature='INTERNAL'))+f"SELECT jsonb_array_length({snap()}->'totals')",'3')
 def test_retest_preserves_first(self):self.ok(auth()+save()+save(cost(iteration=2))+f"SELECT {snap()}->>'count',{snap()}->'totals'->0->>'known_amount'",'2|4000.00')
 def test_voucher_does_not_add_cost_again(self):
  x,y=uid(),uid();self.ok(project()+auth()+save(cost(category='EQUIPMENT',equipment_kind='CALIBRATION',equipment_id=E,scope='EQUIPMENT',amount=4000),x)+save(cost(category='EQUIPMENT',equipment_kind='REPAIR',equipment_id=E,scope='CASE',project_id=P),y)+save(voucher([x,y]),kind='voucher')+f"SELECT {snap()}->'totals'->0->>'known_amount',{snap({'project_id':P})}->'totals'->0->>'known_amount'",'6000.00|2000.00')
 def test_duplicate_voucher_rejected(self):self.deny(auth()+save(voucher([]),kind='voucher')+save(voucher([]),kind='voucher'),'duplicate key')
 def test_cost_cannot_link_twice(self):
  x=uid();self.deny(auth()+save(id=x)+save(voucher([x]),kind='voucher')+save(voucher([x],number='SYN2',finance_number='F2'),kind='voucher'),'duplicate key')
 def test_estimate_cannot_link_voucher(self):
  x=uid();self.deny(auth()+save(cost(phase='ESTIMATE'),x)+save(voucher([x]),kind='voucher'),'FINANCE_LINKS_INVALID')
 def test_voucher_currency_must_match(self):
  x=uid();self.deny(auth()+save(cost(currency='USD'),x)+save(voucher([x]),kind='voucher'),'FINANCE_LINKS_INVALID')
 def test_linked_sum_cannot_exceed_voucher(self):
  x=uid();self.deny(auth()+save(cost(amount=7000),x)+save(voucher([x]),kind='voucher'),'FINANCE_LINK_TOTAL_INVALID')
 def test_linked_cost_cannot_be_voided(self):
  x=uid();self.deny(auth()+save(id=x)+save(voucher([x]),kind='voucher')+save({},x,rev=1,void=True),'FINANCE_LINKED_COST')
 def test_operation_exact_once_and_recovery(self):
  x,o=uid(),uid();q=save(id=x,op=o);self.ok(auth()+q+q+f"SELECT {snap()}->>'count',dqa_business.finance_result('{T}','{o}')->>'state'",'1|SAVED')
 def test_operation_reuse_changed_content_rejected(self):
  x,o=uid(),uid();self.deny(auth()+save(id=x,op=o)+save(cost(amount=1),x,op=o),'FINANCE_OPERATION_CONFLICT')
 def test_revision_and_audit(self):
  x=uid();self.ok(auth()+save(id=x)+save(cost(amount=1000),x,rev=1)+save({},x,rev=2,void=True)+f"SELECT jsonb_array_length(dqa_business.finance_events('{T}','{x}')),{snap()}->'totals'",'3|[]')
 def test_cross_workspace_equipment_rejected(self):self.deny(auth()+save(cost(category='EQUIPMENT',equipment_kind='USE',equipment_id='b4000000-0000-0000-0000-000000000001')),'foreign key')
 def attach(self,x,mime='application/pdf',data=b'%PDF-1.4\nsynthetic\n%%EOF'):return f"SELECT dqa_business.finance_attach('{T}','{x}',1,'synthetic.pdf','{mime}','{base64.b64encode(data).decode()}');"
 def test_attachment_private_read_and_idempotent_upload(self):
  x=uid();self.ok(auth()+save(voucher([]),x,'voucher')+self.attach(x)+self.attach(x)+f"SELECT dqa_business.finance_file('{T}','{x}')->>'mime',jsonb_array_length(dqa_business.finance_events('{T}','{x}'))",'application/pdf|2')
 def test_attachment_wrong_type(self):
  x=uid();self.deny(auth()+save(voucher([]),x,'voucher')+self.attach(x,data=b'<svg>fake</svg>'),'FINANCE_FILE_INVALID')
 def test_attachment_other_tenant(self):
  x=uid();self.deny(auth()+save(voucher([]),x,'voucher')+self.attach(x)+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"+f"SELECT dqa_business.finance_file('{T}','{x}')",'FINANCE_ACCESS_DENIED')
 def test_attachment_readonly_upload_denied(self):
  x=uid();self.deny(role()+auth()+save(voucher([]),x,'voucher')+auth(OTHER)+self.attach(x),'FINANCE_ACCESS_DENIED')
 def test_forged_actor_rejected(self):self.deny(auth()+save(cost(created_by=OTHER)),'FINANCE_FIELDS_INVALID')
 def test_old_service_history_exact_lookup_beyond_recent_200(self):
  event=uid();seed=f"INSERT INTO dqa_business.resource_events(id,tenant_id,kind,resource_id,operation_id,actor_member_id,actor_label,action,reason,created_at) VALUES('{event}','{T}','equipment','{E}',gen_random_uuid(),'a2000000-0000-0000-0000-000000000001','Synthetic','STATUS','Synthetic old service','2020-01-01');INSERT INTO dqa_business.resource_events(tenant_id,kind,resource_id,operation_id,actor_member_id,actor_label,action,reason) SELECT '{T}','equipment','{E}',gen_random_uuid(),'a2000000-0000-0000-0000-000000000001','Synthetic','STATUS','Synthetic newer service' FROM generate_series(1,211);"
  self.ok(seed+auth()+save(cost(category='EQUIPMENT',equipment_kind='REPAIR',equipment_id=E,scope='EQUIPMENT',service_event_id=event))+f"SELECT dqa_business.finance_context('{T}','{event}')->'service_events'->0->>'id'",event)
 def test_finance_does_not_mutate_workflow_materials_schedules_or_reports(self):
  tables=['requests','materials','schedules','reports'];expr="||".join(f"coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY id)::text FROM dqa_business.{t} x),'')" for t in tables)
  self.ok(f"CREATE TEMP TABLE before_finance AS SELECT md5({expr}) AS digest;"+auth()+save()+"RESET ROLE;"+f"SELECT digest=md5({expr}) FROM before_finance",'t')
 def test_correction_link_total_remains_consistent(self):
  x=uid();self.deny(auth()+save(id=x)+save(voucher([x]),kind='voucher')+save(cost(amount=7000),x,rev=1),'FINANCE_LINK_TOTAL_INVALID')
 def test_other_tenant_cost_link_denied(self):
  x=uid();self.deny(auth()+save(id=x)+"SET LOCAL request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"+save(voucher([x]),kind='voucher',t=B),'FINANCE_LINKS_INVALID')
 def test_same_operation_other_actor_cannot_recover(self):
  o=uid();self.ok(role(True)+auth()+save(op=o)+auth(OTHER)+f"SELECT dqa_business.finance_result('{T}','{o}')->>'state'",'NOT_FOUND')
 def test_file_read_requires_finance_access_after_upload(self):
  x=uid();self.deny(auth()+save(voucher([]),x,'voucher')+self.attach(x)+auth(OTHER)+f"SELECT dqa_business.finance_file('{T}','{x}')",'FINANCE_ACCESS_DENIED')
 def test_file_size_limit(self):
  x=uid();self.deny(auth()+save(voucher([]),x,'voucher')+self.attach(x,data=b'%PDF-'+b'x'*262144),'FINANCE_FILE_INVALID')
 def test_cost_exact_decimal_readback(self):self.ok(auth()+save(cost(amount='999999999999.99'))+f"SELECT {snap()}->'costs'->0->>'amount'",'999999999999.99')

r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'passed':r.wasSuccessful(),'local_only':True,'all_mutations_rolled_back':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
