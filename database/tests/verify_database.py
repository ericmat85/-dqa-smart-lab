"""Integration checks against the isolated synthetic PostgreSQL database only.

No cloud connection string is accepted. Every mutation test rolls back.
Usage: python database/tests/verify_database.py --state /path/LOCAL_DATABASE.json
"""
import argparse
import json
import os
import subprocess
import unittest
from pathlib import Path

PARSER = argparse.ArgumentParser()
PARSER.add_argument('--state', required=True)
PARSER.add_argument('--database')
PARSER.add_argument('--result', required=True)
PARSER.add_argument('--migration-count', type=int, default=3)
ARGS = PARSER.parse_args()
STATE = json.loads(Path(ARGS.state).read_text())
assert STATE['network'] == 'none' and STATE['published_ports'] == []
assert STATE['container'].startswith('dqa-business-local-')
ENV = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
observed = json.loads(subprocess.check_output(DOCKER + ['inspect', '--format', '{{json .HostConfig.NetworkMode}}', STATE['container']], env=ENV))
assert observed == 'none'
DB = ARGS.database or STATE['database']
assert DB.startswith('dqa_business_')
CMD = DOCKER + ['exec', '-i', STATE['container'], 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', STATE['owner'], '-d', DB]

A = 'a0000000-0000-0000-0000-000000000001'
B = 'b0000000-0000-0000-0000-000000000001'
OWNER = 'a2000000-0000-0000-0000-000000000002'
EQUIP = 'a4000000-0000-0000-0000-000000000001'
REQ = 'a6000000-0000-0000-0000-000000000001'
SCH = 'a8000000-0000-0000-0000-000000000002'


def query(sql, role=None, uid=None):
    context = ''
    if uid:
        context += f"SET LOCAL request.jwt.claim.sub='{uid}';"
    if role:
        assert role in ('anon', 'authenticated')
        context += f'SET LOCAL ROLE {role};'
    return subprocess.run(CMD, input='BEGIN;\n' + context + sql + ';\nROLLBACK;', text=True, capture_output=True, env=ENV)


class DatabaseTests(unittest.TestCase):
    def ok(self, sql, expected=None, role=None, uid=None):
        result = query(sql, role, uid)
        self.assertEqual(result.returncode, 0, result.stderr)
        if expected is not None:
            self.assertEqual(result.stdout.strip(), expected)
        return result.stdout.strip()

    def rejects(self, sql, message, role=None, uid=None):
        result = query(sql, role, uid)
        self.assertNotEqual(result.returncode, 0, 'Statement unexpectedly succeeded')
        self.assertIn(message, result.stderr)

    def test_schema_and_migrations(self):
        self.ok("SELECT count(*) FROM dqa_business.schema_migrations", str(ARGS.migration_count))
        self.ok("SELECT count(*) FROM pg_tables WHERE schemaname='dqa_business' AND tablename<>'schema_migrations'", str(33 if ARGS.migration_count>=12 else 32 if ARGS.migration_count>=11 else 31 if ARGS.migration_count>=10 else 29 if ARGS.migration_count>=9 else 28))
        self.ok("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='dqa_business' AND c.relkind='r' AND c.relname<>'schema_migrations' AND NOT c.relrowsecurity", '0')

    def test_read_only_acl(self):
        self.ok("SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='dqa_business' AND grantee IN ('anon','authenticated','PUBLIC') AND privilege_type<>'SELECT'", '0')
        self.ok("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_private' AND has_function_privilege('anon',p.oid,'EXECUTE')", '0')
        self.ok("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='dqa_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE')", str(6 if ARGS.migration_count>=7 else 5))
        if ARGS.migration_count>=7:
            self.ok("SELECT count(*) FROM pg_policies WHERE schemaname='dqa_business' AND policyname='active_case_only' AND permissive='RESTRICTIVE' AND cmd='SELECT'", '12')

    def test_requester_request_and_file_scope(self):
        user = '10000000-0000-0000-0000-000000000002'
        for table, count in [('tenants', 1), ('memberships', 1), ('roles', 0), ('requests', 1), ('schedules', 1), ('schedule_equipment', 1), ('artifacts', 1), ('artifact_versions', 1), ('report_versions', 1), ('materials', 0), ('audit_events', 0)]:
            with self.subTest(table=table):
                self.ok(f'SELECT count(*) FROM dqa_business.{table}', str(count), 'authenticated', user)

    def test_admin_a_and_b_isolation(self):
        for uid, tenant, expected in [('10000000-0000-0000-0000-000000000001', A, 2), ('20000000-0000-0000-0000-000000000001', B, 1)]:
            self.ok(f"SELECT count(*),bool_and(tenant_id='{tenant}') FROM dqa_business.requests", f'{expected}|t', 'authenticated', uid)

    def test_lab_can_read_all_own_tenant_requests(self):
        self.ok('SELECT count(*) FROM dqa_business.requests', '2', 'authenticated', '10000000-0000-0000-0000-000000000003')

    def test_unknown_identity_and_forged_tenant(self):
        self.ok(f"SET LOCAL app.tenant_id='{B}'; SELECT count(*) FROM dqa_business.requests", '1', 'authenticated', '10000000-0000-0000-0000-000000000002')
        self.ok('SELECT count(*) FROM dqa_business.requests', '0', 'authenticated', '99999999-0000-0000-0000-000000000001')
        self.ok('SELECT count(*) FROM dqa_business.requests', '0', 'authenticated')

    def test_disabled_member_role_tenant(self):
        for table, ident in [('memberships', OWNER), ('roles', 'a1000000-0000-0000-0000-000000000002'), ('tenants', A)]:
            self.ok(f"UPDATE dqa_business.{table} SET enabled=false WHERE id='{ident}'; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET LOCAL ROLE authenticated; SELECT count(*) FROM dqa_business.requests", '0')

    def test_client_mutations_and_helpers_denied(self):
        for sql in [f"UPDATE dqa_business.memberships SET role_id='a1000000-0000-0000-0000-000000000001' WHERE id='{OWNER}'", f"DELETE FROM dqa_business.requests WHERE id='{REQ}'", f"INSERT INTO dqa_business.tenants(code,name) VALUES('BAD','BAD')", 'SELECT * FROM dqa_business.schema_migrations']:
            self.rejects(sql, 'permission denied', 'authenticated', '10000000-0000-0000-0000-000000000001')
        self.rejects('SELECT * FROM dqa_business.requests', 'permission denied', 'anon')

    def test_cross_tenant_fk(self):
        self.rejects(f"UPDATE dqa_business.requests SET trial_id='b3000000-0000-0000-0000-000000000001' WHERE id='{REQ}'", 'foreign key constraint')
        self.rejects(f"UPDATE dqa_business.memberships SET role_id='b1000000-0000-0000-0000-000000000001' WHERE id='{OWNER}'", 'foreign key constraint')

    def test_required_space_and_positive_stock(self):
        for value in ['NULL', '0', '-1']:
            self.rejects(f"INSERT INTO dqa_business.equipment(tenant_id,legacy_id,name,category,space_units) VALUES('{A}','TEMP','Temp','ENV',{value})", 'violates')
        for assignments in ['available_quantity=6', 'available_quantity=-1', "total_quantity='NaN'", "available_quantity='NaN'"]:
            self.rejects(f'UPDATE dqa_business.materials SET {assignments}', 'violates check constraint')

    def test_legacy_unique_per_tenant(self):
        self.ok("SELECT count(*) FROM dqa_business.equipment WHERE legacy_id='EQ-TEST'", '2')
        self.rejects(f"INSERT INTO dqa_business.equipment(tenant_id,legacy_id,name,category,space_units) VALUES('{A}','EQ-TEST','Temp','ENV',1)", 'unique constraint')

    def allocation(self, start, end, units=2, released='NULL'):
        return f"INSERT INTO dqa_business.schedule_equipment(tenant_id,schedule_id,equipment_id,reserve_from,reserve_until,allocated_units,sample_quantity,released_at) VALUES('{A}','{SCH}','{EQUIP}','{start}','{end}',{units},1,{released});"

    def test_capacity_and_reduction(self):
        self.rejects(self.allocation('2027-01-06T00:00+08', '2027-01-07T00:00+08', 7), 'EQUIPMENT_SPACE_EXCEEDED')
        self.rejects(f"UPDATE dqa_business.equipment SET space_units=2 WHERE id='{EQUIP}'", 'EQUIPMENT_SPACE_RESERVED')

    def test_overlap_adjacent_released_windows(self):
        self.rejects(self.allocation('2027-01-04T12:00+08', '2027-01-05T12:00+08'), 'exclusion constraint')
        self.ok(self.allocation('2027-01-05T00:00+08', '2027-01-06T00:00+08'))
        self.ok(self.allocation('2027-01-04T12:00+08', '2027-01-05T12:00+08', released='clock_timestamp()'))

    def test_reports_match_request_and_version(self):
        self.rejects(f"INSERT INTO dqa_business.report_versions(tenant_id,report_id,request_id,version,artifact_id,artifact_version_id) VALUES('{A}','ac000000-0000-0000-0000-000000000001','{REQ}',2,'aa000000-0000-0000-0000-000000000002','ab000000-0000-0000-0000-000000000002')", 'REPORT_ARTIFACT_BINDING_REQUIRED')
        self.rejects(f"INSERT INTO dqa_business.report_versions(tenant_id,report_id,request_id,version,artifact_id,artifact_version_id) VALUES('{A}','ac000000-0000-0000-0000-000000000001','{REQ}',2,'aa000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000002')", 'foreign key constraint')

    def test_append_only_and_artifact_identity(self):
        for sql in ["UPDATE dqa_business.artifact_versions SET sha256=repeat('f',64)", 'DELETE FROM dqa_business.report_versions', 'DELETE FROM dqa_business.audit_events']:
            self.rejects(sql, 'APPEND_ONLY_RECORD')
        self.rejects("UPDATE dqa_business.artifacts SET kind='SIGNATURE'", 'ARTIFACT_BINDING_IMMUTABLE')

    def test_workflow_gates(self):
        for table, status in [('requests', 'RUNNING'), ('schedules', 'BOOKED'), ('reports', 'SUBMITTED')]:
            self.rejects(f"UPDATE dqa_business.{table} SET status='{status}'", 'RULE_NOT_APPROVED')
        self.rejects(f"INSERT INTO dqa_business.requests(tenant_id,legacy_id,owner_member_id,status) VALUES('{A}','BAD','{OWNER}','RUNNING')", 'RULE_NOT_APPROVED')
        self.rejects(f"INSERT INTO dqa_business.approval_events(tenant_id,request_id,actor_member_id,stage,decision) VALUES('{A}','{REQ}','{OWNER}','SIGN','APPROVE')", 'RULE_NOT_APPROVED')

    def test_signature_cannot_use_report_file(self):
        self.rejects(f"INSERT INTO dqa_business.approval_events(tenant_id,request_id,actor_member_id,stage,signature_version_id) VALUES('{A}','{REQ}','{OWNER}','NOTE','ab000000-0000-0000-0000-000000000001')", 'SIGNATURE_ARTIFACT_BINDING_REQUIRED')

    def test_revision_and_optimistic_update(self):
        self.ok(f"UPDATE dqa_business.requests SET purpose='Changed' WHERE id='{REQ}' AND revision=1; SELECT revision FROM dqa_business.requests WHERE id='{REQ}'; WITH stale AS(UPDATE dqa_business.requests SET purpose='Stale' WHERE id='{REQ}' AND revision=1 RETURNING id) SELECT count(*) FROM stale", '2\n0')
        self.rejects(f"UPDATE dqa_business.requests SET revision=99 WHERE id='{REQ}'", 'REVISION_IS_DATABASE_MANAGED')

    def test_audit_metadata_only_and_atomic(self):
        self.ok(f"UPDATE dqa_business.requests SET purpose='SECRET_TEST_CONTENT' WHERE id='{REQ}'; SELECT count(*) FROM dqa_business.audit_events WHERE record_id='{REQ}' AND operation='UPDATE' AND 'purpose'=ANY(changed_columns); SELECT count(*) FROM information_schema.columns WHERE table_schema='dqa_business' AND table_name='audit_events' AND column_name IN ('payload','old_values','new_values')", '1\n0')

    def test_invalid_dates_and_secret_settings(self):
        self.rejects(f"UPDATE dqa_business.requests SET requested_date='infinity' WHERE id='{REQ}'", 'violates check constraint')
        self.rejects(f"INSERT INTO dqa_business.settings(tenant_id,module,configuration) VALUES('{A}','test','{{\"api_key\":\"DO_NOT_STORE\"}}')", 'violates check constraint')
        self.rejects(f"INSERT INTO dqa_business.quality_records(tenant_id,title,owner_member_id,status,severity) VALUES('{A}','Test','{OWNER}','RESOLVED','LOW')", 'violates check constraint')


suite = unittest.defaultTestLoader.loadTestsFromTestCase(DatabaseTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
Path(ARGS.result).write_text(json.dumps({'database': DB, 'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors), 'passed': result.wasSuccessful(), 'synthetic_only': True}, indent=2) + '\n')
raise SystemExit(not result.wasSuccessful())
