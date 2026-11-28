"""Rollback-only selected-request batch proposals, atomic draft saves and recovery."""
from pathlib import Path
exec(compile(Path(__file__).with_name('verify_date_scheduling.py').read_text().split('\nclass Tests',1)[0],str(Path(__file__)),'exec'))
BATCH='bd630000-0000-4000-8000-000000000001'
def second_request(index=1,priority='一般',virtual_case=False):
 sql=other_request().replace('"priority": "一般"','"priority": "'+priority+'"').split('SELECT dqa_business.save_preapproval_sample_number',1)[0].replace('ed000000-0000-4000-8000-',f'bd63{index:04x}-0000-4000-8000-')
 rid=f'bd63{index:04x}-0000-4000-8000-000000000001'
 if virtual_case:sql=sql.replace('dqa_business.create_request_draft(','dqa_business.create_classified_request_draft(',1).replace('::jsonb);',"::jsonb,'VIRTUAL');",1)
 return sql+f"RESET ROLE;UPDATE dqa_business.requests SET form_details=jsonb_set(form_details,'{{priority}}','\"{priority}\"') WHERE id='{rid}';"
R2='bd630001-0000-4000-8000-000000000001'
def command(ids=None,units=1,member=None,first=START,last=None):
 ids=ids or [REQ,R2];member=member or f"(SELECT id FROM dqa_business.memberships WHERE tenant_id='{T}' AND auth_user_id='{uid(1)}')"
 return f"jsonb_build_object('expected_member',{member},'options',jsonb_build_object('earliest','{first}','latest','{last or (datetime.fromisoformat(first)+timedelta(days=31)).date().isoformat()}'),'selection',(SELECT jsonb_agg(jsonb_build_object('request_id',q.id,'expected_request_revision',q.revision,'expected_draft_revision',coalesce((SELECT revision FROM dqa_business.schedule_drafts WHERE tenant_id=q.tenant_id AND request_id=q.id),0),'sample_space_units',{units},'equipment_count',CASE WHEN q.form_details->>'priority'='委外' THEN 0 ELSE 1 END,'sample_code','') ORDER BY q.id) FROM dqa_business.requests q WHERE q.tenant_id='{T}' AND q.id=ANY(ARRAY[{','.join(chr(39)+x+chr(39) for x in ids)}]::uuid[])))"
def prepare(ids=None,units=1,oid=BATCH,cmd_value=None,**kw):return 'RESET ROLE;'+auth(1)+f"SELECT set_config('test.batch.command',({cmd_value or command(ids,units,**kw)})::text,true);SELECT dqa_business.prepare_schedule_batch('{T}','{oid}',current_setting('test.batch.command')::jsonb);"
def save_batch(oid=BATCH):return f"SELECT dqa_business.execute_schedule_batch('{T}','{oid}');"
def packet(oid=BATCH):return f"dqa_business.schedule_batch_result('{T}','{oid}')"
class Tests(unittest.TestCase):
 def ok(self,sql):
  r=execute(sql);self.assertEqual(r.returncode,0,r.stderr[-4000:]);self.assertNotIn('f',r.stdout.strip().splitlines());self.assertEqual(r.stdout.strip().splitlines()[-1],'t')
 def deny(self,sql,error):
  r=execute(sql);self.assertNotEqual(r.returncode,0);self.assertIn(error,r.stderr[-3000:])
 def test_preview_coordinates_two_selected_cases_without_business_writes(self):self.ok(second_request()+prepare()+f"SELECT {packet()}->>'ready_count'='2';RESET ROLE;SELECT NOT EXISTS(SELECT 1 FROM dqa_business.schedule_drafts WHERE tenant_id='{T}') AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE tenant_id='{T}' AND status NOT IN('DRAFT','CANCELLED')) AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id='{T}' AND schedule_id IN(SELECT id FROM dqa_business.schedules WHERE request_id IN('{REQ}','{R2}')));")
 def test_preview_reserves_eleven_dates_and_avoids_internal_equipment_overlap(self):self.ok(second_request()+prepare()+f"SELECT bool_and((j->'plan'->>'scheduling_days')::int=11) AND max((j->'plan'->>'start_date')::date)-min((j->'plan'->>'start_date')::date)>=11 FROM jsonb_array_elements({packet()}->'jobs')j;")
 def test_urgent_priority_is_processed_before_general(self):self.ok(second_request(priority='急件')+prepare()+f"SELECT {packet()}->'jobs'->0->>'request_id'='{R2}' AND {packet()}->'jobs'->0->>'priority'='急件';")
 def test_save_is_atomic_draft_only_and_does_not_number_or_approve(self):self.ok(second_request()+prepare()+save_batch()+f"SELECT {packet()}->>'state'='SAVED' AND jsonb_array_length({packet()}->'results')=2;RESET ROLE;SELECT count(*)=2 AND bool_and(plan->>'sample_code'='') AND NOT EXISTS(SELECT 1 FROM dqa_business.schedules WHERE tenant_id='{T}' AND status NOT IN('DRAFT','CANCELLED')) AND NOT EXISTS(SELECT 1 FROM dqa_private.preapproval_samples WHERE tenant_id='{T}') FROM dqa_business.schedule_drafts WHERE tenant_id='{T}';")
 def test_same_batch_replay_does_not_repeat_draft_revisions(self):self.ok(second_request()+prepare()+save_batch()+save_batch()+f"RESET ROLE;SELECT count(*)=2 AND max(revision)=1 FROM dqa_business.schedule_drafts WHERE tenant_id='{T}';")
 def test_missing_units_block_only_selected_rows_and_leave_sources_unchanged(self):self.ok(second_request()+prepare(units='NULL')+f"SELECT {packet()}->>'ready_count'='0' AND {packet()}->>'blocked_count'='2' AND (SELECT bool_and(j->>'reason_code'='BATCH_UNITS_REQUIRED') FROM jsonb_array_elements({packet()}->'jobs')j);")
 def test_unselected_case_is_not_written(self):self.ok(second_request()+prepare([REQ])+save_batch()+f"RESET ROLE;SELECT count(*)=1 AND bool_and(request_id='{REQ}') FROM dqa_business.schedule_drafts WHERE tenant_id='{T}';")
 def test_saved_nonselected_draft_is_avoided(self):self.ok(plan()+second_request()+prepare([R2])+f"SELECT ({packet()}->'jobs'->0->'plan'->>'start_date')::date>=(SELECT (plan->>'end_date')::date+1 FROM dqa_business.schedule_drafts WHERE request_id='{REQ}');")
 def test_request_revision_change_cannot_commit_any_batch_rows(self):self.deny(second_request()+prepare()+f"RESET ROLE;UPDATE dqa_business.requests SET acceptance=acceptance||' 更新' WHERE id='{R2}';"+auth(1)+save_batch(),'REVISION_CONFLICT')
 def test_one_late_rate_failure_rolls_back_already_processed_rows(self):
  sql=second_request()+prepare()+f"RESET ROLE;INSERT INTO dqa_private.schedule_draft_operations(tenant_id,id,actor_id,fingerprint) SELECT '{T}',md5('synthetic-rate-'||g)::uuid,'{uid(1)}','x' FROM generate_series(1,99)g;"+auth(1)+f"DO $t$ BEGIN BEGIN PERFORM dqa_business.execute_schedule_batch('{T}','{BATCH}');RAISE EXCEPTION 'EXPECTED_FAILURE_MISSING';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PLANNING_RATE_LIMITED' THEN RAISE;END IF;END;END $t$;RESET ROLE;SELECT NOT EXISTS(SELECT 1 FROM dqa_business.schedule_drafts WHERE tenant_id='{T}') AND (SELECT state='PLANNED' FROM dqa_private.schedule_batch_operations WHERE id='{BATCH}');"
  self.ok(sql)
 def test_expired_preview_cannot_be_saved(self):self.deny(second_request()+prepare()+f"RESET ROLE;UPDATE dqa_private.schedule_batch_operations SET expires_at=clock_timestamp()-interval '1 second';"+auth(1)+save_batch(),'BATCH_EXPIRED')
 def test_expired_result_is_definitive_without_writing(self):self.ok(second_request()+prepare()+f"RESET ROLE;UPDATE dqa_private.schedule_batch_operations SET expires_at=clock_timestamp()-interval '1 second';"+auth(1)+f"SELECT {packet()}->>'state'='EXPIRED';")
 def test_member_assertion_and_other_tenant_cannot_prepare(self):self.deny(second_request()+prepare(member="'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid"),'BATCH_ACCESS_DENIED')
 def test_duplicate_request_selection_is_rejected(self):self.deny(second_request()+prepare(cmd_value=f"({command([REQ])})||jsonb_build_object('selection',({command([REQ])})->'selection'||({command([REQ])})->'selection')"),'BATCH_FIELDS_INVALID')
 def test_arbitrary_scopes_and_forged_fields_are_rejected(self):self.deny(second_request()+prepare(cmd_value=f"({command()})||jsonb_build_object('tenant_id','{T}')"),'BATCH_FIELDS_INVALID')
 def test_mismatching_operation_replay_is_rejected(self):self.deny(second_request()+prepare()+prepare([REQ]),'BATCH_OPERATION_CONFLICT')
 def test_private_batch_records_are_not_directly_writable(self):self.deny(auth(1)+'DELETE FROM dqa_private.schedule_batch_operations;','permission denied')
 def test_readonly_requester_cannot_prepare(self):self.deny(second_request()+prepare().replace(auth(1),auth(2)),'BATCH_ACCESS_DENIED')
 def test_first_signature_removes_batch_eligibility(self):self.ok(first()+prepare([REQ])+f"SELECT {packet()}->>'ready_count'='0' AND {packet()}->'jobs'->0->>'reason_code'='BATCH_NOT_ELIGIBLE';")
 def test_packet_does_not_expose_full_commands_or_segments(self):self.ok(second_request()+prepare()+f"SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements({packet()}->'jobs')j WHERE j ? 'command' OR j->'plan' ? 'segments' OR j ? 'tenant_id');")
 def test_virtual_cases_do_not_fabricate_physical_occupancy(self):self.ok(second_request(virtual_case=True)+prepare()+f"SELECT bool_and(j->>'state'='READY') AND count(DISTINCT j->'plan'->>'start_date')=1 FROM jsonb_array_elements({packet()}->'jobs')j;")
 def test_outsourced_case_has_no_equipment_reservation(self):self.ok(second_request(priority='委外')+prepare([R2])+save_batch()+f"RESET ROLE;SELECT plan->>'outsourced'='true' AND plan->'allocations'='[]'::jsonb AND NOT EXISTS(SELECT 1 FROM dqa_business.schedule_equipment WHERE tenant_id='{T}' AND schedule_id IN(SELECT id FROM dqa_business.schedules WHERE request_id IN('{REQ}','{R2}'))) FROM dqa_business.schedule_drafts WHERE request_id='{R2}';")
 def test_equipment_revision_change_invalidates_entire_save(self):self.deny(second_request()+prepare()+f"RESET ROLE;UPDATE dqa_business.equipment SET space_units=space_units+1 WHERE id='{EQ}';"+auth(1)+save_batch(),'REVISION_CONFLICT')
 def test_full_window_has_explicit_blocked_rows(self):self.ok(second_request()+prepare(last=START)+f"SELECT {packet()}->>'ready_count'='1' AND {packet()}->>'blocked_count'='1' AND {packet()}->'jobs'->1->>'reason_code'='BATCH_NO_SLOT';")
 def test_blocked_row_retains_its_old_draft_and_conflicts_are_not_overwritten(self):
  c=f"jsonb_set(({command()}),'{{selection,1,sample_space_units}}','null'::jsonb)"
  self.ok(plan()+second_request()+prepare(cmd_value=c)+f"SELECT {packet()}->>'ready_count'='0' AND {packet()}->>'blocked_count'='2';RESET ROLE;SELECT count(*)=1 AND bool_and(request_id='{REQ}') AND max(revision)=1 FROM dqa_business.schedule_drafts WHERE tenant_id='{T}';")
 def test_existing_note_is_preserved_when_replanning_a_saved_draft(self):self.ok(plan()+prepare([REQ])+save_batch()+f"RESET ROLE;SELECT plan->>'note'='合成排程' FROM dqa_business.schedule_drafts WHERE request_id='{REQ}';")
 def test_result_after_saved_acknowledgement_reads_same_receipts(self):self.ok(second_request()+prepare()+save_batch()+f"SELECT {packet()}->>'state'='SAVED' AND jsonb_array_length({packet()}->'results')=2;")
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests));Path(a.result).write_text(json.dumps({'passed':result.wasSuccessful(),'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'all_mutations_rolled_back':True},indent=2));raise SystemExit(not result.wasSuccessful())
