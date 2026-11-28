"""Rollback-only trial conditions, equipment ownership, rich descriptions and soft deletion."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_trial_types.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
def literal(v):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII='
def details(**kw):
 d=dict(conditions=[dict(kind='TEMPERATURE',unit='°C',lower=-40,upper=85)],equipment_ids=[E],description=[dict(type='text',text='試驗時間：4 小時。'),dict(type='image',data=PNG,caption='合成治具照片')]);d.update(kw);return d
def create(**kw):return auth()+save(command())+save(command('trial',id=D,data=trial(definition_details=details(**kw))),OP2)
class Tests(unittest.TestCase):
 def ok(self,sql,expected='t'):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-2500:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,error):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2200:])
 def test_rich_conditions_and_equipment_are_durable(self):self.ok(create()+f"SELECT dqa_business.trial_editor_detail('{T}','{D}')->'details'={literal(details())};")
 def test_bootstrap_never_embeds_image_bytes(self):self.ok(create()+f"SELECT NOT(dqa_business.original_ui_snapshot('{T}')::text LIKE '%iVBORw0%') AND dqa_business.original_ui_snapshot('{T}')->'trial_editor_details'->0->'details'->'equipment_ids'={literal([E])};")
 def test_reversed_limits_are_rejected(self):self.deny(create(conditions=[dict(kind='TEMPERATURE',unit='°C',lower=85,upper=-40)]),'TRIAL_DETAILS_INVALID')
 def test_unknown_condition_cannot_bypass_native_validator(self):self.deny(create(conditions=[dict(kind=None,unit='°C',lower=None,upper=None)]),'TRIAL_DETAILS_INVALID')
 def test_wrong_unit_is_rejected(self):self.deny(create(conditions=[dict(kind='FORCE',unit='°C',lower=0,upper=1)]),'TRIAL_DETAILS_INVALID')
 def test_duplicate_conditions_are_rejected(self):self.deny(create(conditions=details()['conditions']*2),'TRIAL_DETAILS_INVALID')
 def test_nonworkspace_equipment_rejected(self):self.deny(create(equipment_ids=['ffffffff-ffff-4fff-8fff-ffffffffffff']),'TRIAL_EQUIPMENT_INVALID')
 def test_duplicate_equipment_rejected(self):self.deny(create(equipment_ids=[E,E]),'TRIAL_EQUIPMENT_INVALID')
 def test_unsafe_image_url_rejected(self):self.deny(create(description=[dict(type='text',text='試驗時間：4 小時。'),dict(type='image',data='javascript:alert(1)',caption='x')]),'TRIAL_DETAILS_INVALID')
 def test_description_text_must_match_saved_plain_spec(self):self.deny(create(description=[dict(type='text',text='其他內容')]),'TRIAL_DETAILS_INVALID')
 def test_delete_hides_trial_without_deleting_record(self):self.ok(create()+save(command('trial','delete',D,1,{'reason':'合成停用'}),'ec000000-0000-4000-8000-000000000012')+f"RESET ROLE;SELECT NOT enabled AND revision=2 AND (SELECT count(*)=1 FROM dqa_private.trial_editor_settings WHERE trial_id='{D}') FROM dqa_business.trial_definitions WHERE id='{D}';")
 def test_delete_replay_does_not_repeat_revision(self):self.ok(create()+save(command('trial','delete',D,1,{'reason':'合成停用'}),'ec000000-0000-4000-8000-000000000012')+execute('ec000000-0000-4000-8000-000000000012')+f"RESET ROLE;SELECT revision=2 FROM dqa_business.trial_definitions WHERE id='{D}';")
 def test_deleted_trial_cannot_be_silently_restored(self):self.deny(create()+save(command('trial','delete',D,1,{'reason':'合成停用'}),'ec000000-0000-4000-8000-000000000012')+save(command('trial',id=D,revision=2,data=trial()),'ec000000-0000-4000-8000-000000000013'),'TRIAL_DELETED')
 def test_nonmanager_cannot_delete(self):self.deny(create()+'RESET ROLE;'+auth('10000000-0000-0000-0000-000000000002')+save(command('trial','delete',D,1,{'reason':'x'}),'ec000000-0000-4000-8000-000000000012'),'RESOURCE_WRITE_DENIED')
 def test_stale_delete_rejected(self):self.deny(create()+save(command('trial','delete',D,9,{'reason':'x'}),'ec000000-0000-4000-8000-000000000012'),'REVISION_CONFLICT')
 def test_private_metadata_not_client_writable(self):self.deny(auth()+"DELETE FROM dqa_private.trial_editor_settings;",'permission denied')
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not r.wasSuccessful())
