-- Empty, additive business schema. Apply only through the reviewed transactional bundle.
-- auth.users/auth.uid() and platform roles must already be supplied by Supabase.
CREATE SCHEMA dqa_business;
CREATE SCHEMA dqa_private;
REVOKE ALL ON SCHEMA dqa_business, dqa_private FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, dqa_business, extensions, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA dqa_business REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA dqa_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE dqa_business.schema_migrations (
 name text PRIMARY KEY, sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE dqa_business.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{1,80}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), timezone text NOT NULL DEFAULT 'Asia/Taipei' CHECK (timezone='Asia/Taipei'),
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE dqa_business.sites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, name text NOT NULL CHECK (length(btrim(name))>0), location text,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id)
);
CREATE TABLE dqa_business.departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, name text NOT NULL CHECK(length(btrim(name))>0), parent_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), CHECK(parent_id IS DISTINCT FROM id),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES dqa_business.departments(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE dqa_business.roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 code text NOT NULL CHECK(code ~ '^[A-Za-z0-9_-]{1,80}$'), name text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 is_tenant_admin boolean NOT NULL DEFAULT false, permissions text[] NOT NULL DEFAULT '{}',
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code),
 CHECK(permissions <@ ARRAY['members.read','catalog.read','equipment.read','materials.read','requests.read_all','schedules.read_all','reports.read_all','quality.read','qualifications.read','audit.read','settings.read']::text[])
);
CREATE TABLE dqa_business.memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 auth_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT, legacy_id text NOT NULL,
 display_name text NOT NULL CHECK(length(btrim(display_name))>0), role_id uuid NOT NULL, department_id uuid, site_id uuid,
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), UNIQUE(tenant_id,auth_user_id),
 FOREIGN KEY(tenant_id,role_id) REFERENCES dqa_business.roles(tenant_id,id),
 FOREIGN KEY(tenant_id,department_id) REFERENCES dqa_business.departments(tenant_id,id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES dqa_business.sites(tenant_id,id)
);
CREATE TABLE dqa_business.trial_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, name text NOT NULL CHECK(length(btrim(name))>0), aliases text[] NOT NULL DEFAULT '{}', profile_code text,
 specification text NOT NULL DEFAULT '', acceptance text NOT NULL DEFAULT '', equipment_reference text NOT NULL DEFAULT '',
 specification_version text NOT NULL, duration_hours numeric(12,4) CHECK(duration_hours>0),
 source_kind text NOT NULL DEFAULT 'MANUAL' CHECK(source_kind IN ('MANUAL','SYNTHETIC','IMPORTED')),
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), UNIQUE(tenant_id,name)
);
CREATE TABLE dqa_business.equipment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, name text NOT NULL CHECK(length(btrim(name))>0), category text NOT NULL, model text, serial_number text,
 site_id uuid, owner_member_id uuid, space_units integer NOT NULL CHECK(space_units BETWEEN 1 AND 100000),
 daily_hours numeric(4,1) NOT NULL DEFAULT 24 CHECK(daily_hours BETWEEN 0.5 AND 24),
 operational_status text NOT NULL DEFAULT 'IDLE' CHECK(operational_status IN ('IDLE','IN_USE','MAINTENANCE','CALIBRATION','ON_LOAN','PAUSED','RETIRED')),
 specification text NOT NULL DEFAULT '', next_calibration date, next_maintenance date,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES dqa_business.sites(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, name text NOT NULL, category text NOT NULL, unit text NOT NULL CHECK(length(btrim(unit))>0),
 total_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK(total_quantity>=0), available_quantity numeric(18,6) NOT NULL DEFAULT 0,
 min_stock numeric(18,6) NOT NULL DEFAULT 0 CHECK(min_stock>=0), site_id uuid, owner_member_id uuid,
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','IN_USE','CALIBRATION','MAINTENANCE','OUT_OF_STOCK','RETIRED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), CHECK(available_quantity>=0 AND available_quantity<=total_quantity),
 FOREIGN KEY(tenant_id,site_id) REFERENCES dqa_business.sites(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants ON DELETE RESTRICT,
 legacy_id text NOT NULL, owner_member_id uuid NOT NULL, supervisor_member_id uuid, trial_id uuid,
 product_code text, customer_name text, purpose text NOT NULL DEFAULT '', quantity integer CHECK(quantity>0), requested_date date,
 sample_space_units integer CHECK(sample_space_units>0), specification text NOT NULL DEFAULT '', acceptance text NOT NULL DEFAULT '',
 trial_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(trial_snapshot)='object'),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','AWAITING_REQUEST_MANAGER','AWAITING_LMS_REVIEW','AWAITING_SCHEDULING','AWAITING_LAB_RECEIPT','RUNNING','COMPLETED','AWAITING_REPORT_REVIEW','AWAITING_VIEW_CONFIRMATION','CLOSED','RETURNED','CANCELLED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), CHECK(supervisor_member_id IS DISTINCT FROM owner_member_id),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,supervisor_member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id)
);
CREATE TABLE dqa_business.request_samples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 request_id uuid NOT NULL, sample_code text NOT NULL, description text, space_units integer CHECK(space_units>0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id,sample_code),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id)
);
CREATE TABLE dqa_business.schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 legacy_id text NOT NULL, request_id uuid NOT NULL, executor_member_id uuid,
 starts_at timestamptz, ends_at timestamptz, preparation_minutes integer NOT NULL DEFAULT 0 CHECK(preparation_minutes>=0), cleanup_minutes integer NOT NULL DEFAULT 0 CHECK(cleanup_minutes>=0),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','BOOKED','AWAITING_RECEIPT','RUNNING','PAUSED','COMPLETED','CANCELLED','PENDING_APPROVAL')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), UNIQUE(tenant_id,id,request_id),
 CHECK((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at)),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),
 FOREIGN KEY(tenant_id,executor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.schedule_equipment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 schedule_id uuid NOT NULL, equipment_id uuid NOT NULL, reserve_from timestamptz NOT NULL, reserve_until timestamptz NOT NULL,
 allocated_units integer NOT NULL CHECK(allocated_units>0), sample_quantity integer NOT NULL CHECK(sample_quantity>0), released_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,schedule_id,equipment_id), CHECK(reserve_until>reserve_from),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES dqa_business.schedules(tenant_id,id),
 FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id),
 EXCLUDE USING gist(tenant_id WITH =,equipment_id WITH =,tstzrange(reserve_from,reserve_until,'[)') WITH &&) WHERE (released_at IS NULL)
);
CREATE TABLE dqa_business.borrows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 legacy_id text NOT NULL, borrower_member_id uuid NOT NULL, equipment_id uuid, material_id uuid,
 quantity numeric(18,6) NOT NULL CHECK(quantity>0), purpose text, starts_at timestamptz, due_at timestamptz,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','ON_LOAN','RETURNED','REJECTED','CANCELLED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), CHECK(num_nonnulls(equipment_id,material_id)=1), CHECK(equipment_id IS NULL OR quantity=1),
 CHECK(due_at IS NULL OR starts_at IS NULL OR due_at>=starts_at),
 FOREIGN KEY(tenant_id,borrower_member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id),
 FOREIGN KEY(tenant_id,material_id) REFERENCES dqa_business.materials(tenant_id,id)
);
CREATE TABLE dqa_business.material_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 material_id uuid NOT NULL, borrow_id uuid, actor_member_id uuid, kind text NOT NULL CHECK(kind IN ('OPENING','ADJUSTMENT','RESERVATION','RETURN')),
 total_delta numeric(18,6) NOT NULL DEFAULT 0, available_delta numeric(18,6) NOT NULL DEFAULT 0, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,material_id) REFERENCES dqa_business.materials(tenant_id,id),
 FOREIGN KEY(tenant_id,borrow_id) REFERENCES dqa_business.borrows(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.lab_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 request_id uuid NOT NULL, actor_member_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('RECEIVE','CANCEL','INTERRUPT','COMPLETE','SUBMIT_REPORT')), reason text,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id), FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 legacy_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('REQUEST_FORM','REPORT','TEMPLATE','SIGNATURE','PHOTO','MANUAL','SPECIFICATION','EVIDENCE')),
 name text NOT NULL, request_id uuid, trial_id uuid, owner_member_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,legacy_id), UNIQUE(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.artifact_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 artifact_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), storage_bucket text NOT NULL, object_key text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), byte_size bigint NOT NULL CHECK(byte_size>=0), mime_type text NOT NULL,
 created_by_member_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,artifact_id), UNIQUE(tenant_id,artifact_id,version), UNIQUE(tenant_id,storage_bucket,object_key),
 CHECK(object_key<>'' AND object_key !~ '(^/|(^|/)\.\.(/|$)|[\r\n])'),
 FOREIGN KEY(tenant_id,artifact_id) REFERENCES dqa_business.artifacts(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 request_id uuid NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','REVIEW_L2','REVIEW_L3','AWAITING_VIEW','ARCHIVED','RETURNED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,request_id), UNIQUE(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id)
);
CREATE TABLE dqa_business.report_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 report_id uuid NOT NULL, request_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), artifact_id uuid NOT NULL, artifact_version_id uuid NOT NULL,
 created_by_member_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,request_id), UNIQUE(tenant_id,report_id,version),
 FOREIGN KEY(tenant_id,report_id,request_id) REFERENCES dqa_business.reports(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,artifact_id,request_id) REFERENCES dqa_business.artifacts(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,artifact_version_id,artifact_id) REFERENCES dqa_business.artifact_versions(tenant_id,id,artifact_id),
 FOREIGN KEY(tenant_id,created_by_member_id) REFERENCES dqa_business.memberships(tenant_id,id)
);
CREATE TABLE dqa_business.approval_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 request_id uuid NOT NULL, report_version_id uuid, actor_member_id uuid NOT NULL, stage text NOT NULL,
 decision text NOT NULL DEFAULT 'NOTE' CHECK(decision IN ('NOTE','SUBMIT','APPROVE','RETURN','VIEW')),
 signature_version_id uuid, comment text, signature_verification text NOT NULL DEFAULT 'NOT_VERIFIED' CHECK(signature_verification='NOT_VERIFIED'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),
 FOREIGN KEY(tenant_id,report_version_id,request_id) REFERENCES dqa_business.report_versions(tenant_id,id,request_id),
 FOREIGN KEY(tenant_id,actor_member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,signature_version_id) REFERENCES dqa_business.artifact_versions(tenant_id,id)
);
CREATE TABLE dqa_business.qualifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 member_id uuid NOT NULL, equipment_id uuid, trial_id uuid, training text NOT NULL, issued_on date NOT NULL, expires_on date NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), CHECK(expires_on>=issued_on),
 FOREIGN KEY(tenant_id,member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id)
);
CREATE TABLE dqa_business.quality_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 title text NOT NULL, owner_member_id uuid NOT NULL, request_id uuid, equipment_id uuid, trial_id uuid,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED')), severity text NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH')),
 cause text, action text, resolution text, due_on date,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), CHECK(num_nonnulls(request_id,equipment_id,trial_id)<=1), CHECK(status<>'RESOLVED' OR length(btrim(resolution))>0),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES dqa_business.requests(tenant_id,id),
 FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES dqa_business.trial_definitions(tenant_id,id)
);
CREATE TABLE dqa_business.equipment_ports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 equipment_id uuid NOT NULL, protocol text NOT NULL CHECK(protocol IN ('modbus-tcp','modbus-rtu','http-json')),
 host inet, tcp_port integer CHECK(tcp_port BETWEEN 1 AND 65535), scheme text CHECK(scheme IN ('http','https')), read_path text,
 serial_port text, baud_rate integer CHECK(baud_rate BETWEEN 1200 AND 230400), parity text CHECK(parity IN ('N','E','O')), stop_bits smallint CHECK(stop_bits IN (1,2)),
 unit_id integer CHECK(unit_id BETWEEN 1 AND 247 OR unit_id=255), function_code integer CHECK(function_code IN (3,4)), timeout_ms integer NOT NULL DEFAULT 3000 CHECK(timeout_ms BETWEEN 500 AND 5000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), CHECK(protocol<>'modbus-rtu' OR unit_id IS NULL OR unit_id<=247),
 CHECK(read_path IS NULL OR read_path ~ '^/[^?#]*$' AND read_path !~ '^//|[\r\n]'),
 FOREIGN KEY(tenant_id,equipment_id) REFERENCES dqa_business.equipment(tenant_id,id)
);
CREATE TABLE dqa_business.equipment_port_points (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 port_id uuid NOT NULL, name text NOT NULL, register_address integer CHECK(register_address BETWEEN 0 AND 65535), json_pointer text,
 data_type text NOT NULL DEFAULT 'uint16' CHECK(data_type IN ('uint16','int16','uint32','int32','float32')),
 word_order text NOT NULL DEFAULT 'high-first' CHECK(word_order IN ('high-first','low-first')),
 scale numeric NOT NULL DEFAULT 1 CHECK(scale::text NOT IN ('NaN','Infinity','-Infinity')), value_offset numeric NOT NULL DEFAULT 0 CHECK(value_offset::text NOT IN ('NaN','Infinity','-Infinity')), unit text,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,port_id,name), CHECK(register_address IS NULL OR data_type IN ('uint16','int16') OR register_address<=65534),
 FOREIGN KEY(tenant_id,port_id) REFERENCES dqa_business.equipment_ports(tenant_id,id)
);
CREATE TABLE dqa_business.settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 module text NOT NULL, configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,module),
 CHECK(NOT configuration ?| ARRAY['password','token','secret','api_key','service_role'])
);
CREATE TABLE dqa_business.audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 actor_auth_user_id uuid, database_role text NOT NULL, table_name text NOT NULL, record_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')), changed_columns text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE dqa_business.import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 source_name text NOT NULL, source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'STAGED' CHECK(status IN ('STAGED','VALIDATED','REJECTED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(tenant_id,id)
);
CREATE TABLE dqa_business.import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES dqa_business.tenants,
 batch_id uuid NOT NULL, source_collection text NOT NULL, legacy_id text NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 validation_errors jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(validation_errors)='array'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,batch_id,source_collection,legacy_id),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES dqa_business.import_batches(tenant_id,id)
);
