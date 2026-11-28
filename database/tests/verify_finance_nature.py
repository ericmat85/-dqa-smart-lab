"""Cost nature read-filter coverage in an isolated synthetic local database."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_finance.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
class Tests(unittest.TestCase):
 def ok(self,sql,expected):
  result=run(sql);self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip().splitlines()[-1],expected)
 def deny(self,sql,message):
  result=run(sql);self.assertNotEqual(result.returncode,0);self.assertIn(message,result.stderr)
 def test_all_natures_unchanged(self):self.ok(auth()+save()+save(cost(nature='INTERNAL'))+f"SELECT {snap()}->>'count'",'2')
 def test_internal_records_counts_and_totals_match(self):self.ok(auth()+save()+save(cost(nature='INTERNAL',amount=25))+f"SELECT {snap({'nature':'INTERNAL'})}->>'count',{snap({'nature':'INTERNAL'})}->'totals'->0->>'known_amount',{snap({'nature':'INTERNAL'})}->'costs'->0->>'nature'",'1|25.00|INTERNAL')
 def test_external_filter_before_paging(self):self.ok(auth()+''.join(save(cost(nature='INTERNAL',amount=1)) for _ in range(51))+save(cost(amount=35))+f"SELECT {snap({'nature':'EXTERNAL'})}->>'count',jsonb_array_length({snap({'nature':'EXTERNAL'})}->'costs'),{snap({'nature':'EXTERNAL'})}->'totals'->0->>'known_amount'",'1|1|35.00')
 def test_annual_scope_does_not_take_nature_filter(self):self.ok(auth()+save()+save(cost(nature='INTERNAL'))+f"SELECT jsonb_array_length({snap({'nature':'EXTERNAL','year':2026})}->'annual')",'2')
 def test_unknown_enum_rejected(self):self.deny(auth()+f"SELECT {snap({'nature':'INVALID'})}",'FINANCE_FIELDS_INVALID')
 def test_empty_nature_is_no_filter(self):self.ok(auth()+save()+f"SELECT {snap({'nature':''})}->>'count'",'1')
 def test_permission_unchanged(self):self.deny(auth(OTHER)+f"SELECT {snap({'nature':'EXTERNAL'})}",'FINANCE_ACCESS_DENIED')
 def test_currency_phase_stay_separate(self):self.ok(auth()+save()+save(cost(currency='USD'))+save(cost(phase='ESTIMATE'))+f"SELECT jsonb_array_length({snap({'nature':'EXTERNAL'})}->'totals')",'3')
 def test_voucher_list_not_nature_filtered(self):self.ok(auth()+save(voucher([]),kind='voucher')+f"SELECT {snap({'nature':'INTERNAL'})}->>'voucher_count'",'1')
r=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':r.wasSuccessful(),'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'local_only':True},indent=2)+'\n');raise SystemExit(not r.wasSuccessful())
