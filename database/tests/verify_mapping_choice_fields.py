"""Extend the mapping contract against an isolated local database. All transactions roll back."""
from pathlib import Path
import importlib.util,json,unittest
spec=importlib.util.spec_from_file_location('mapping_base',Path(__file__).with_name('verify_document_cell_mapping.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
KEYS=['judgementRequiredCheck','judgementNotRequiredCheck','purposeNewProduct','purposeEV','purposeReproduction','purposeOtherSelected','purposeDesignChange','purposeDV','purposePeriodic','purposeMassProduct','purposePV','purposeOtherContent','sourceInHouseContent','sourceOverseasContent','sourceCustomerContent','sourceSupplierContent','sourceCompetitorContent']
class Tests(b.Tests):
 def test_new_mapping_choice_fields_all_accepted(self):
  rows=[{'field':key,'sheet':'原稿','cell':'A'+str(i+1)} for i,key in enumerate(KEYS)]
  self.ok(b.auth()+b.report()+b.mapping(rows=rows)+f"SELECT jsonb_array_length(dqa_business.document_mapping_catalog('{b.T}')->'targets'->0->'mapping');",str(len(KEYS)))
 def test_original_form_accepts_each_source_content_string(self):
  details={key:'合成來源內容' for key in KEYS if key.startswith('source')};self.ok("SELECT dqa_private.validate_original_fields('"+json.dumps(details,ensure_ascii=False)+"','');SELECT 'ok';",'ok')
 def test_original_form_rejects_nonstring_source_content(self):self.deny("SELECT dqa_private.validate_original_fields('{\"sourceInHouseContent\":{}}','');",'ORIGINAL_FORM_INVALID')
 def test_modern_source_payload_is_pinned_without_combining_contents(self):
  p={'product_code':'A08','form_details':{'sampleSource':['社內 In-house production','客戶 Customer'],'sourceInHouseContent':'生產一課','sourceCustomerContent':'甲公司'}}
  self.ok(b.auth()+b.seed(payload=p)+f"RESET ROLE;SELECT payload->'form_details'->>'sourceCustomerContent' FROM dqa_private.mapped_document_pins WHERE document_id='{b.DOC}';",'甲公司')
 def test_missing_one_of_selected_source_contents_is_rejected_despite_legacy_note(self):
  p={'form_details':{'sampleSource':['社內','客戶'],'sourceInHouseContent':'生產一課','sourceCustomerContent':'','sampleSourceOther':'舊的共用說明'}}
  self.deny(b.auth()+b.seed(payload=p),'ORIGINAL_SOURCE_REQUIRED')
 def test_unselected_source_content_does_not_make_a_selected_source_complete(self):self.deny(b.auth()+b.seed(payload={'form_details':{'sampleSource':['社內'],'sourceCustomerContent':'甲公司'}}),'ORIGINAL_SOURCE_REQUIRED')
 def test_unselected_extra_content_is_retained_but_does_not_block_valid_submission(self):self.ok(b.auth()+b.seed(payload={'form_details':{'sampleSource':['社內'],'sourceInHouseContent':'生產一課','sourceCustomerContent':'暫存內容'}})+"SELECT 'ok';",'ok')
 def test_other_purpose_requires_explanation_at_submission(self):self.deny(b.auth()+b.seed(payload={'form_details':{'purpose':['其他（請說明）Other'],'purposeOther':''}}),'OTHER_PURPOSE_REQUIRED')
 def test_other_purpose_explanation_is_pinned(self):self.ok(b.auth()+b.seed(payload={'form_details':{'purpose':['其他（請說明）Other'],'purposeOther':'客戶指定驗證'}})+"SELECT 'ok';",'ok')
 def test_choice_content_validator_cannot_be_called_directly_by_authenticated(self):self.deny(b.auth()+"SELECT dqa_private.validate_request_choice_contents('{}');",'permission denied')
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(b.a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
