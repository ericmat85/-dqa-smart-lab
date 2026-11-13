"""Independent legacy-U quota and physical evidence checks; Fake HTTP only."""
import copy
import time
import unittest
import test_e2_scheduling as helpers
from gateway.e2_scheduling import evaluate, validate_context, fingerprint, capacity, EQUIPMENT, CASES
from gateway.e4_preview_provider import E4Error

class UnitTests(unittest.TestCase):
    def setUp(self):
        self.now=time.time()
        self.context=helpers.fixture(self.now)

    def test_legacy_context_and_fingerprint_do_not_gain_an_implicit_null_unit(self):
        normalized=validate_context(self.context,self.now)
        self.assertNotIn('sample_space_units',normalized['request'])
        self.assertEqual(evaluate(self.context,self.now)['context_fingerprint'],fingerprint(self.context))

    def test_unit_quota_reduces_sample_count_but_is_not_a_litre_conversion(self):
        request=copy.deepcopy(self.context['request']);machine=EQUIPMENT['EQ-003'];case=CASES[request['id']]
        original,_=capacity(machine,case,request)
        request['sample_space_units']=4
        limited,_=capacity(machine,case,request)
        self.assertEqual(limited,min(original,machine['space_units']//4))
        self.assertEqual(request['sample_volume_litres'],1)
        request['sample_volume_litres']=.1
        self.assertEqual(capacity(machine,case,request)[1],'SAMPLE_VOLUME_BELOW_DOCUMENTED_ENVELOPE')

    def test_explicit_missing_units_remain_unknown_not_assumed_from_litres(self):
        self.context['request']['sample_space_units']=None
        result=evaluate(self.context,self.now)
        self.assertEqual(result['status'],'UNKNOWN')
        self.assertEqual(result['reasons'],['SAMPLE_SPACE_UNITS_REQUIRED'])

    def test_invalid_unit_values_and_forged_machine_unit_fields_are_rejected(self):
        for value in [0,-1,True,1.5,'2',1001]:
            c=copy.deepcopy(self.context);c['request']['sample_space_units']=value
            with self.assertRaisesRegex(E4Error,'E2_INVALID_SYNTHETIC_CONTEXT'):
                evaluate(c,self.now)
        self.context['equipment'][0]['space_units']=99999
        with self.assertRaisesRegex(E4Error,'E2_INVALID_SYNTHETIC_CONTEXT'):
            evaluate(self.context,self.now)

    def test_known_unit_shortfall_is_infeasible_while_missing_geometry_stays_unknown(self):
        for m in self.context['equipment']:
            m['status']='STANDBY' if m['id']=='EQ-003' else 'MAINTENANCE'
        self.context['request'].update(sample_space_units=4,quantity=3)
        self.assertEqual(evaluate(self.context,self.now)['status'],'INFEASIBLE_IN_WINDOW')
        for m in self.context['equipment']:
            m['status']='STANDBY' if m['id']=='EQ-002' else 'MAINTENANCE'
        self.assertEqual(evaluate(self.context,self.now)['status'],'UNKNOWN')

    def test_new_unit_context_uses_same_signed_session_gateway_rbac_and_trace_contract(self):
        h=helpers.ProviderTests();h.setUp()
        try:
            h.context['request']['sample_space_units']=1
            h.test_gateway_session_dto_methods_and_fake_actor_are_rejected_over_asgi()
        finally:
            h.tearDown()

if __name__=='__main__':
    unittest.main()
