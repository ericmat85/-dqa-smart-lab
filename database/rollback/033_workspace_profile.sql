-- Local/reviewed rollback only. Retain profile values and minimal audit history.
BEGIN;
DROP FUNCTION dqa_business.save_workspace_profile(uuid,jsonb,bigint);
DROP FUNCTION dqa_business.workspace_profile(uuid);
COMMIT;
