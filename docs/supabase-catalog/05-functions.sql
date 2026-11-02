-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'function',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
         jsonb_build_object('ddl',pg_get_functiondef(p.oid),
           'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,
           'security_definer',p.prosecdef,'config',p.proconfig)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind IN ('f','p') AND (n.nspname='public' OR p.oid IN (
    SELECT t.tgfoid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='auth' AND NOT t.tgisinternal))
) SELECT * FROM inventory;
COMMIT;
