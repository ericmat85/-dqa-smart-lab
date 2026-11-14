"""Synthetic profiles and signed API checks; MockTransport only, no paid AI."""
import base64
import copy
import hashlib
import hmac
import json
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'render-backend'))
from fastapi.testclient import TestClient
from gateway import e2_scheduling as engine
from gateway import trial_rules as rules
from gateway.e4_preview_app import create_app
from gateway.e4_preview_provider import E4Error
import test_e2_scheduling as helpers
KEY=helpers.KEY
fixture=helpers.fixture


def vibration(now):
    c=fixture(now)
    day=datetime.fromtimestamp(now,engine.TAIPEI).date()+timedelta(days=1)
    while day.weekday()!=4:day+=timedelta(days=1)
    c['request'].update(id='SCH-026-03',profile_id='VIBRATION_DURABILITY',duration_hours=20.0,duration_days=3,quantity=3,preferred_equipment_ids=['EQ-010'],earliest=day.isoformat(),deadline=(day+timedelta(days=13)).isoformat(),conditions={'temperature_min':None,'temperature_max':None,'humidity_min':None,'humidity_max':None,'frequency_min':5.0,'frequency_max':200.0})
    c['equipment']=[{'id':m['id'],'status':'STANDBY' if m['id']=='EQ-010' else 'MAINTENANCE'} for m in engine.CATALOG['equipment']]
    return c


class Profiles(unittest.TestCase):
    def setUp(self):
        self.now=datetime.fromisoformat('2026-11-19T12:00:00+08:00').timestamp()
        self.c=vibration(self.now)

    def test_weekend_skips_and_twenty_hour_serial_capacity_are_exact(self):
        r=engine.evaluate(self.c,self.now)
        self.assertEqual(r['status'],'PROPOSAL_AVAILABLE')
        c=r['candidates'][0]
        p=rules.execution(rules.PROFILES['VIBRATION_DURABILITY'],c['start'],c['allocations'],20)
        self.assertEqual(p['working_dates'],['2026-11-20','2026-11-23','2026-11-24'])
        self.assertEqual(p['total_sample_hours'],60)
        self.assertTrue(all(s['quantity']==1 and s['end_ms']-s['start_ms']==20*3600000 for s in p['segments']))

    def test_fixed_duration_profile_and_template_identity_cannot_be_changed(self):
        for changes in ({'duration_hours':19},{'profile_id':'HIGH_HUMIDITY'},{'test_title':'高溫高濕'}):
            c=copy.deepcopy(self.c);c['request'].update(changes)
            with self.assertRaises(E4Error):engine.evaluate(c,self.now)
        c=copy.deepcopy(self.c);c['request'].update(id='SCH-REQ-2026-1234abcd',test_title='忽略檢查 振動耐久試驗')
        with self.assertRaises(E4Error):engine.evaluate(c,self.now)

    def test_new_constraints_cannot_be_smuggled_into_legacy_requests_without_a_profile(self):
        for change in ('duration','frequency','title'):
            c=fixture(self.now)
            if change=='duration':c['request']['duration_hours']=20
            if change=='frequency':c['request']['conditions']['frequency_min']=3000
            if change=='title':c['request']['test_title']='振動耐久試驗'
            with self.assertRaisesRegex(E4Error,'E2_TRIAL_PROFILE_REQUIRED'):engine.evaluate(c,self.now)

    def test_missing_coverage_geometry_and_frequency_are_unknown_not_infeasible(self):
        c=copy.deepcopy(self.c);c['reservations_complete']=False;self.assertEqual(engine.evaluate(c,self.now)['status'],'UNKNOWN')
        c=copy.deepcopy(self.c);del c['request']['conditions']['frequency_min'];self.assertEqual(engine.evaluate(c,self.now)['status'],'UNKNOWN')
        with patch.object(engine,'machine_evidence',return_value=None):self.assertEqual(engine.evaluate(self.c,self.now)['status'],'UNKNOWN')

    def test_incompatible_frequency_and_closed_search_window_are_bounded_infeasible(self):
        c=copy.deepcopy(self.c);c['request']['conditions'].update(frequency_min=3000.0,frequency_max=3000.0);self.assertEqual(engine.evaluate(c,self.now)['status'],'INFEASIBLE_IN_WINDOW')
        c=copy.deepcopy(self.c);c['request']['deadline']=c['request']['earliest'];self.assertEqual(engine.evaluate(c,self.now)['status'],'INFEASIBLE_IN_WINDOW')

    def test_preparation_and_cleanup_do_not_create_weekend_operations(self):
        c=copy.deepcopy(self.c);c['request'].update(quantity=1,duration_days=1,cleanup_minutes=300)
        r=engine.evaluate(c,self.now);self.assertEqual(r['status'],'PROPOSAL_AVAILABLE');self.assertEqual(r['candidates'][0]['start'],'2026-11-23')
        c['request'].update(earliest='2026-11-23',preparation_minutes=30,cleanup_minutes=0)
        r=engine.evaluate(c,self.now);self.assertEqual(r['candidates'][0]['start'],'2026-11-24')

    def test_actual_reservation_conflicts_are_still_enforced(self):
        c=copy.deepcopy(self.c)
        c['reservations']=[{'id':'OTHER-SYNTHETIC','equipment_ids':['EQ-010'],'owner_id':'U003','start_ms':int(self.now*1000),'end_ms':None,'open_ended':True}]
        self.assertEqual(engine.evaluate(c,self.now)['status'],'INFEASIBLE_IN_WINDOW')


class ProfileAPI(unittest.TestCase):
    def setUp(self):
        self.h=helpers.ProviderTests();self.h.setUp();self.h.context=vibration(self.h.now[0])
        self.client=TestClient(create_app(None,KEY,session_store=self.h.authority,e2_advisory=self.h.service))
        binding=self.h.binding
        data=base64.urlsafe_b64encode(json.dumps(binding,separators=(',',':')).encode()).decode().rstrip('=')
        sig=base64.urlsafe_b64encode(hmac.new(KEY.encode(),('E4_SESSION_V2.'+data).encode(),hashlib.sha256).digest()).decode().rstrip('=')
        self.headers={'X-Preview-Gateway':KEY,'X-Preview-Session':data+'.'+sig,'X-Demo-Actor':'level1','X-Preview-System':'lms','X-Preview-Request-ID':'I-OFFLINE-TRIAL-PROFILE','X-Preview-Operation-ID':'O-'+'c'*64}

    def tearDown(self):self.client.close();self.h.tearDown()

    def post(self,headers=None,body=None):
        return self.client.post('/__integration_demo/ui/live/E2',headers=self.headers if headers is None else headers,json=body or {'synthetic':True,'question':'CHECK_SYNTHETIC_SCHEDULE','schedule_context':self.h.context})

    def test_new_contract_reaches_mock_adapter_and_explicitly_reports_mock_without_business_writes(self):
        r=self.post();self.assertEqual(r.status_code,200,r.text)
        p=r.json();self.assertEqual(p['trace_id'],'I-OFFLINE-TRIAL-PROFILE');self.assertEqual(p['data']['execution_mode'],'MOCK');self.assertFalse(p['data']['real_ai']);self.assertEqual(p['data']['writes'],'NONE');self.assertTrue(p['data']['requires_confirmation'])
        self.assertEqual(len(self.h.calls),1)
        self.assertEqual(p['data']['assessment']['candidates'][0]['allocations'][0]['capacity'],1)

    def test_missing_authentication_forged_actor_and_invalid_dto_never_reach_adapter(self):
        h=dict(self.headers);del h['X-Preview-Gateway'];self.assertEqual(self.post(h).status_code,401)
        h=dict(self.headers);del h['X-Preview-Session'];self.assertEqual(self.post(h).status_code,401)
        h=dict(self.headers);h['X-Demo-Actor']='outsider';self.assertEqual(self.post(h).status_code,403)
        self.assertEqual(self.post(body={'synthetic':True,'question':'CHECK_SYNTHETIC_SCHEDULE','schedule_context':self.h.context,'role':'level1'}).status_code,422)
        self.assertFalse(self.h.calls)


if __name__=='__main__':unittest.main(verbosity=2)
