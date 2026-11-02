-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,
 pg_get_userbyid(e.evtowner) AS owner,n.nspname AS function_schema,p.proname,
 pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef,p.proconfig,p.proacl,
 (n.nspname='public' AND p.proname='rls_auto_enable') AS is_rls_auto_enable
FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
JOIN pg_namespace n ON n.oid=p.pronamespace ORDER BY e.evtname;
-- 另查 handler 定義，即使沒有 Event Trigger 也保留函式存在與否的證據。
SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) AS ddl,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind IN ('f','p') AND (p.oid IN (SELECT evtfoid FROM pg_event_trigger)
 OR (n.nspname='public' AND p.proname='rls_auto_enable'));
COMMIT;
