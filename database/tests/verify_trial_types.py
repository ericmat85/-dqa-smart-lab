"""Rollback-only durable trial classification and authorization; existing method rules remain unchanged."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_resources.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
TYPES=['PLACEMENT','POWERED_PLACEMENT','COMPOUND_CONTINUOUS','COMPOUND_DISCONTINUOUS','OPERATION','OUTSOURCED','OTHER']
class Tests(unittest.TestCase):
 def ok(self,sql,expected='t'):
  r=run(sql);self.assertEqual(r.returncode,0,r.stderr[-2200:]);self.assertEqual(r.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,error):
  r=run(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-2200:])
 def test_seven_types_round_trip_through_authorized_catalog_snapshot(self):
  for kind in TYPES:
   with self.subTest(kind=kind):self.ok(auth()+save(command('trial',id=D,data=trial(test_type=kind)))+f"SELECT dqa_business.original_ui_snapshot('{T}')->'trial_types' @> jsonb_build_array(jsonb_build_object('trial_id','{D}','test_type','{kind}'));")
 def test_updating_type_preserves_method_and_fixed_hours(self):self.ok(auth()+save(command('trial',id=D,data=trial(test_type='PLACEMENT')))+save(command('trial',id=D,revision=1,data=trial(test_type='POWERED_PLACEMENT')),OP2)+f"SELECT profile_code='UNVERIFIED' AND duration_hours=4 AND revision=2 FROM dqa_business.trial_definitions WHERE id='{D}';")
 def test_old_clients_without_type_do_not_erase_saved_classification(self):self.ok(auth()+save(command('trial',id=D,data=trial(test_type='OPERATION')))+save(command('trial',id=D,revision=1,data=trial()),OP2)+f"SELECT dqa_business.original_ui_snapshot('{T}')->'trial_types' @> jsonb_build_array(jsonb_build_object('trial_id','{D}','test_type','OPERATION'));")
 def test_replay_does_not_increment_the_trial_revision_or_duplicate_setting(self):self.ok(auth()+save(command('trial',id=D,data=trial(test_type='OUTSOURCED')))+execute()+f"SELECT revision=1 FROM dqa_business.trial_definitions WHERE id='{D}';")
 def test_unknown_and_nonstring_types_are_rejected(self):
  for bad in ['INVALID','',None,7,{'type':'OTHER'}]:
   with self.subTest(bad=bad):self.deny(auth()+save(command('trial',id=D,data=trial(test_type=bad))),'TRIAL_TYPE_INVALID')
 def test_nonmanager_cannot_change_classification(self):self.deny(auth('10000000-0000-0000-0000-000000000002')+save(command('trial',id=D,data=trial(test_type='OTHER'))),'RESOURCE_WRITE_DENIED')
 def test_direct_private_write_is_denied(self):self.deny(auth()+"DELETE FROM dqa_private.trial_type_settings;",'permission denied')
 def test_type_is_part_of_operation_fingerprint(self):self.deny(auth()+prepare(command('trial',id=D,data=trial(test_type='PLACEMENT')))+"SELECT set_config('test.resource.command',jsonb_set(current_setting('test.resource.command')::jsonb,'{data,test_type}','\"OTHER\"')::text,true);"+execute(),'RESOURCE_OPERATION_CONFLICT')
 def test_type_change_does_not_allow_profile_change(self):self.deny(auth()+save(command('trial',id=D,data=trial(test_type='PLACEMENT')))+save(command('trial',id=D,revision=1,data=trial(test_type='OPERATION',profile_code='THERMAL_SHOCK')),OP2),'TRIAL_PROFILE_IMMUTABLE')
if __name__=='__main__':
 r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_mutations_rolled_back':True,'all_seven_types_checked':True},indent=2));raise SystemExit(not r.wasSuccessful())
