"""Private provider selection contract; all HTTP is Fake and contains synthetic data."""
import json
import unittest
import httpx
import test_e2_scheduling as helpers
from gateway.e2_scheduling import evaluate
from gateway.e4_preview_provider import E4Error


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.h = helpers.ProviderTests()
        self.h.setUp()

    def tearDown(self):
        self.h.tearDown()

    def response(self, text):
        h = self.h
        def fake(request):
            h.calls.append(request)
            payload = json.loads(request.content)
            self.assertEqual(set(payload['text']['format']['schema']['properties']), {'selected_candidate_id'})
            self.assertNotIn('tools', payload)
            return httpx.Response(200, headers={'x-request-id': 'req_MOCK_SELECTION'}, json={
                'id': 'resp_MOCK_SELECTION', 'status': 'completed', 'model': h.cfg.model,
                'usage': {'input_tokens': 90, 'output_tokens': 40},
                'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}]})
        h.client._transport.handler = fake

    def reject(self, text):
        self.response(text)
        with self.assertRaisesRegex(E4Error, 'E2_OUTPUT_REJECTED'):
            self.h.call()
        row = self.h.ledger.attempt('O-local-1')
        self.assertEqual(row['state'], 'OUTPUT_REJECTED_ACCOUNTED')
        self.assertEqual(self.h.ledger.snapshot()['held_nanos'], 0)
        self.assertEqual(self.h.ledger.snapshot()['spent_nanos'], 29000)
        self.assertEqual(len(self.h.calls), 1)
        return row

    def test_exact_model_choice_not_first_candidate_is_preserved_without_fact_prose(self):
        h = self.h
        h.context['request'].update(id='SCH-026-01', quantity=5, preferred_equipment_ids=['EQ-001'],
            conditions={'temperature_min': 100, 'temperature_max': 100, 'humidity_min': None, 'humidity_max': None})
        assessment = evaluate(h.context, h.now[0])
        self.assertEqual(assessment['status'], 'PROPOSAL_AVAILABLE')
        selected = assessment['candidates'][1]['id']
        before = h.authority.snapshot()
        self.response(json.dumps({'selected_candidate_id': selected}))
        result = h.call()
        self.assertEqual(result['selected_candidate_id'], selected)
        self.assertEqual(result['assessment'], assessment)
        self.assertEqual(result['engine'], 'E2')
        self.assertEqual(result['execution_mode'], 'MOCK')
        self.assertFalse(result['real_ai'])
        self.assertIn('未呼叫真實模型', result['summary'])
        self.assertIn('尚未儲存', result['summary'])
        self.assertEqual(result['risks'], [])
        self.assertEqual(result['writes'], 'NONE')
        self.assertTrue(result['requires_confirmation'])
        self.assertEqual(result['trace_id'], 'I-local-e2')
        self.assertEqual(result['usage'], {'input_tokens': 90, 'output_tokens': 40})
        self.assertEqual(result['estimated_cost_usd'], '0.000029')
        self.assertEqual(h.authority.snapshot(), before)

    def test_null_choice_is_not_replaced_with_a_rule_based_candidate(self):
        self.response('{"selected_candidate_id":null}')
        result = self.h.call()
        self.assertTrue(result['assessment']['candidates'])
        self.assertIsNone(result['selected_candidate_id'])
        self.assertIn('未選出可用方案', result['summary'])
        self.assertEqual(result['writes'], 'NONE')

    def test_duplicate_selection_keys_are_rejected_even_if_last_id_is_valid(self):
        selected = evaluate(self.h.context, self.h.now[0])['candidates'][0]['id']
        self.reject('{"selected_candidate_id":"INVENTED","selected_candidate_id":' + json.dumps(selected) + '}')

    def test_legacy_free_text_is_not_silently_sanitised_into_success(self):
        selected = evaluate(self.h.context, self.h.now[0])['candidates'][0]['id']
        self.reject(json.dumps({'selected_candidate_id': selected, 'engine': 'E2',
            'summary': '委託 SCH-026-01 已備妥，尚未儲存。', 'risks': []}))

    def test_secret_in_an_extra_field_is_rejected_and_never_saved(self):
        selected = evaluate(self.h.context, self.h.now[0])['candidates'][0]['id']
        row = self.reject(json.dumps({'selected_candidate_id': selected, 'summary': helpers.PROVIDER_KEY}))
        self.assertNotIn(helpers.PROVIDER_KEY, json.dumps(row))

    def test_unknown_candidate_cannot_be_mapped_or_replaced_with_first_candidate(self):
        self.reject('{"selected_candidate_id":"P-INVENTED"}')

    def test_model_cannot_submit_date_capacity_or_save_commands(self):
        selected = evaluate(self.h.context, self.h.now[0])['candidates'][0]['id']
        self.reject(json.dumps({'selected_candidate_id': selected, 'start': '2099-01-01',
            'capacity': 99999, 'save': True}))

    def test_missing_or_non_string_non_null_selection_is_rejected(self):
        self.reject('{"selected_candidate_id":false}')


if __name__ == '__main__':
    unittest.main()
