"""Resource and stock commands in an isolated, network-disabled PostgreSQL only."""
import argparse,json,subprocess,os,unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--state',required=True);p.add_argument('--result',required=True);a=p.parse_args();s=json.loads(Path(a.state).read_text());assert s['network']=='none' and not s['published_ports'] and s['container'].startswith('dqa-business-local-');env={k:v for k,v in os.environ.items() if k not in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']};cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
T='a0000000-0000-0000-0000-000000000001';U='10000000-0000-0000-0000-000000000001';E='ec000000-0000-4000-8000-000000000001';M='ec000000-0000-4000-8000-000000000002';D='ec000000-0000-4000-8000-000000000003';OP='ec000000-0000-4000-8000-000000000010';OP2='ec000000-0000-4000-8000-000000000011'
def auth(u=U):return f"SET LOCAL request.jwt.claim.sub='{u}';SET LOCAL ROLE authenticated;"
def equipment(**changes):
 d=dict(legacy_id='EQ-SYNTHETIC',name='合成設備',category='溫度試驗',model='SYNTHETIC',serial_number='SYNTHETIC',space_units=6,daily_hours=24,specification='合成設備規格',next_calibration=None,next_maintenance=None,display_details={'location':'合成位置','owner':'合成負責人'});d.update(changes);return d

def material(**changes):
 d=dict(legacy_id='MAT-SYNTHETIC',name='合成物料',category='耗材',unit='件',total_quantity=10,available_quantity=10,min_stock=1,reason='合成建檔',display_details={'location':'合成位置','owner':'合成負責人'});d.update(changes);return d

def trial(**changes):
 d=dict(name='合成新增試驗',aliases=[],profile_code='UNVERIFIED',specification='試驗時間：4 小時。',acceptance='合成判定',equipment_reference='合成設備',specification_version='SYNTH-1',duration_hours=4);d.update(changes);return d

def command(kind='equipment',action='save',id=E,revision=0,data=None):return dict(kind=kind,action=action,id=id,expected_revision=revision,data=data if data is not None else equipment())
def prepare(c,op=OP,t=T):
 q=json.dumps(c,ensure_ascii=False).replace("'","''");return f"SELECT set_config('test.resource.command','{q}',true);SELECT dqa_business.prepare_resource_operation('{t}','{op}',current_setting('test.resource.command')::jsonb);"
def execute(op=OP,t=T):return f"SELECT dqa_business.execute_resource_operation('{t}','{op}',current_setting('test.resource.command')::jsonb);"
def save(c=None,op=OP):return prepare(c or command(),op)+execute(op)
def run(sql):return subprocess.run(cmd,input='BEGIN;'+sql+';ROLLBACK;',text=True,capture_output=True,env=env)
CM=command('material',id=M,data=material());CT=command('trial',id=D,data=trial())
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,expected):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(expected,r.stderr)
 def delete(self,kind='equipment',id=E,revision=1,op=OP2):return save(command(kind,'delete',id,revision,{'reason':'合成刪除測試'}),op)
 def test_equipment_delete_is_hidden_with_one_audit_and_replay(self):self.ok(auth()+save()+self.delete()+execute(OP2)+f"SELECT count(*) FROM dqa_business.equipment WHERE id='{E}';RESET ROLE;SELECT (SELECT count(*) FROM dqa_business.resource_events WHERE resource_id='{E}' AND action='DELETE'),(SELECT count(*) FROM dqa_business.equipment WHERE id='{E}' AND deleted_at IS NOT NULL)",'1|1')
 def test_material_delete_preserves_opening_ledger_and_unit(self):self.ok(auth()+save(CM)+self.delete('material',M)+f"SELECT count(*) FROM dqa_business.materials WHERE id='{M}';RESET ROLE;SELECT count(*),max(unit) FROM dqa_business.materials m JOIN dqa_business.material_transactions t ON t.material_id=m.id WHERE m.id='{M}'",'1|件')
 def test_deleted_resource_cannot_be_edited_or_status_restored(self):self.deny(auth()+save()+self.delete()+save(command(action='status',revision=2,data={'status':'MAINTENANCE','reason':'已刪除不可變更'}),'ec000000-0000-4000-8000-000000000012'),'RESOURCE_DELETED')
 def test_readonly_role_cannot_delete(self):self.deny(auth()+save()+auth('10000000-0000-0000-0000-000000000002')+self.delete(),'RESOURCE_WRITE_DENIED')
 def test_cross_workspace_cannot_delete(self):self.deny(auth()+save()+auth('20000000-0000-0000-0000-000000000001')+self.delete(),'RESOURCE_WRITE_DENIED')
 def test_stale_delete_does_not_remove_resource(self):self.deny(auth()+save()+self.delete(revision=2),'REVISION_CONFLICT')
 def test_reason_required(self):self.deny(auth()+save()+save(command(action='delete',revision=1,data={'reason':' '}),OP2),'RESOURCE_REASON_REQUIRED')
 def test_in_use_and_paused_or_loaned_equipment_block(self):
  for state in ['IN_USE','PAUSED','ON_LOAN']:self.deny(auth()+save()+f"RESET ROLE;UPDATE dqa_business.equipment SET operational_status='{state}' WHERE id='{E}';"+auth()+self.delete(revision=2),'RESOURCE_RESERVED')
 def test_active_allocation_blocks_deletion(self):self.deny(auth()+save()+f"RESET ROLE;INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity) SELECT tenant_id,schedule_id,'{E}',reserve_from,reserve_until,1,1 FROM dqa_business.schedule_equipment LIMIT 1;"+auth()+self.delete(),'RESOURCE_RESERVED')
 def test_material_in_use_blocks(self):self.deny(auth()+save(CM)+f"RESET ROLE;UPDATE dqa_business.materials SET status='IN_USE' WHERE id='{M}';"+auth()+self.delete('material',M,2),'RESOURCE_RESERVED')
 def borrow(self,kind='equipment'):
  field='equipment_id' if kind=='equipment' else 'material_id';id=E if kind=='equipment' else M
  return f"RESET ROLE;ALTER TABLE dqa_business.borrows DISABLE TRIGGER workflow_gate;INSERT INTO dqa_business.borrows(tenant_id,legacy_id,borrower_member_id,{field},quantity,status) SELECT tenant_id,'BORROW-DELETE-TEST',id,'{id}',1,'APPROVED' FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}';ALTER TABLE dqa_business.borrows ENABLE TRIGGER workflow_gate;"+auth()
 def test_active_borrow_blocks_both_kinds(self):
  self.deny(auth()+save()+self.borrow()+self.delete(),'RESOURCE_RESERVED');self.deny(auth()+save(CM)+self.borrow('material')+self.delete('material',M),'RESOURCE_RESERVED')
 def test_deleted_history_reference_and_live_snapshot(self):self.ok(auth()+save()+self.delete()+f"SELECT (SELECT count(*) FROM jsonb_array_elements(dqa_business.original_ui_snapshot('{T}')->'equipment') e WHERE e->>'id'='{E}'),(SELECT count(*) FROM jsonb_array_elements(dqa_business.equipment_usage_snapshot('{T}')->'resource_refs') e WHERE e->>'id'='{E}')",'0|1')
 def settings(self,days=30,rev=0):return f"SELECT dqa_business.save_equipment_activity_settings('{T}','{{\"equipmentDays\":14,\"equipmentStart\":\"\",\"usageDays\":{days}}}',{rev});"
 def test_default_is_actual_30_days(self):self.ok(auth()+f"SELECT dqa_business.equipment_usage_snapshot('{T}')->>'source',dqa_business.equipment_usage_snapshot('{T}')->>'days'",'ACTUAL_TRIAL_EXECUTION|30')
 def test_settings_save_revision_and_snapshot(self):self.ok(auth()+self.settings(7)+f"SELECT dqa_business.equipment_activity_settings('{T}')->'configuration'->>'usageDays',dqa_business.equipment_activity_settings('{T}')->>'revision',dqa_business.equipment_usage_snapshot('{T}')->>'days'",'7|1|7')
 def test_settings_compare_and_swap(self):self.deny(auth()+self.settings(7)+self.settings(90),'REVISION_CONFLICT')
 def test_unchanged_settings_does_not_increment_revision(self):self.ok(auth()+self.settings(7)+self.settings(7,1)+f"SELECT dqa_business.equipment_activity_settings('{T}')->>'revision'",'1')
 def test_invalid_setting_days_and_date_rejected(self):
  self.deny(auth()+self.settings(1),'EQUIPMENT_ACTIVITY_FIELDS_INVALID');self.deny(auth()+f"SELECT dqa_business.save_equipment_activity_settings('{T}','{{\"equipmentDays\":14,\"equipmentStart\":\"2026-02-30\",\"usageDays\":30}}',0)",'EQUIPMENT_ACTIVITY_FIELDS_INVALID')
 def test_readonly_settings_cannot_save(self):
  self.deny(auth('10000000-0000-0000-0000-000000000002')+self.settings(7),'RESOURCE_WRITE_DENIED')
 def trial(self,start,end=None,kind='REAL',status='COMPLETED',release=None):
  # Synthetic owner fixtures only; gates are restored before invoking authenticated RPCs.
  startsql=f"statement_timestamp()-interval '{start}'" if start else 'NULL';endsql=f"statement_timestamp()-interval '{end}'" if end else 'NULL';releasesql=f"statement_timestamp()-interval '{release}'" if release else "statement_timestamp()";sid='ec000000-0000-4000-8000-'+str(getattr(self,'seq',100)).zfill(12);self.seq=getattr(self,'seq',100)+1
  return f"RESET ROLE;ALTER TABLE dqa_business.requests DISABLE TRIGGER execution_kind_guard;INSERT INTO dqa_business.requests(id,tenant_id,legacy_id,owner_member_id,execution_kind) SELECT '{sid}','{T}','{sid}',id,'{kind}' FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{U}';ALTER TABLE dqa_business.requests ENABLE TRIGGER execution_kind_guard;ALTER TABLE dqa_business.schedules DISABLE TRIGGER workflow_gate;ALTER TABLE dqa_business.schedules DISABLE TRIGGER execution_kind_guard;INSERT INTO dqa_business.schedules(id,tenant_id,legacy_id,request_id,starts_at,ends_at,status,execution_kind,started_at,completed_at) SELECT '{sid}','{T}','{sid}',id,statement_timestamp()-interval '40 days',statement_timestamp()+interval '1 day','{status}','{kind}',{startsql},{endsql} FROM dqa_business.requests WHERE id='{sid}';ALTER TABLE dqa_business.schedules ENABLE TRIGGER workflow_gate;ALTER TABLE dqa_business.schedules ENABLE TRIGGER execution_kind_guard;INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity,released_at) VALUES('{T}','{sid}','{E}',statement_timestamp()-interval '40 days',statement_timestamp()+interval '1 day',1,1,{releasesql});"+auth()
 def usage(self):return f"SELECT occupied_seconds::numeric::bigint FROM jsonb_to_recordset(dqa_business.equipment_usage_snapshot('{T}')->'rows') AS u(id uuid,occupied_seconds numeric) WHERE id='{E}'"
 def test_zero_usage_is_not_demo_seed_value(self):self.ok(auth()+save()+self.usage(),'0')
 def test_actual_24_hours_is_counted(self):self.ok(auth()+save()+self.trial('2 days','1 day')+self.usage(),'86400')
 def test_overlapping_intervals_are_unioned(self):self.ok(auth()+save()+self.trial('2 days','1 day')+self.trial('36 hours','12 hours')+self.usage(),'129600')
 def test_long_trial_is_clipped_to_window(self):self.ok(auth()+save()+self.trial('40 days','1 day')+self.usage(),str(29*86400))
 def test_virtual_and_not_started_and_future_are_excluded(self):self.ok(auth()+save()+self.trial('2 days','1 day','VIRTUAL')+self.trial(None,None,status='BOOKED')+self.trial('-1 day',None,status='RUNNING')+self.usage(),'0')
 def test_running_trial_uses_current_time(self):self.ok(auth()+save()+self.trial('1 hour',None,status='RUNNING')+self.usage(),'3600')
 def test_released_allocation_caps_actual_occupancy(self):self.ok(auth()+save()+self.trial('2 days',None,status='CANCELLED',release='1 day')+self.usage(),'86400')
 def test_new_window_recomputes_from_same_actual_data(self):self.ok(auth()+save()+self.trial('20 days','10 days')+self.settings(7)+self.usage(),'0')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
