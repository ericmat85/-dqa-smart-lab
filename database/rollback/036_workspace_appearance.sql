-- Disable the new interface-color endpoints; retain any saved preference and audit.
-- Older deployments do not reference these functions or settings.
BEGIN;
REVOKE EXECUTE ON FUNCTION dqa_business.workspace_appearance(uuid),dqa_business.save_workspace_appearance(uuid,jsonb,bigint) FROM authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
