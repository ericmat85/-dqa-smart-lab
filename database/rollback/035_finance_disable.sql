-- Disable finance RPCs without deleting financial rows, attachments or audit.
-- Operational rollback only. No automatic execution; local verification first.
BEGIN;
DO $$DECLARE f regprocedure;BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='dqa_business' AND p.proname IN('finance_context','finance_snapshot','finance_result','finance_save','finance_events','finance_file','finance_attach')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',f);END LOOP;
END$$;
COMMIT;
