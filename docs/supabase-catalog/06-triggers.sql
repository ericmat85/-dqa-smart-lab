-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'trigger',format('%I.%I.%I',n.nspname,c.relname,t.tgname),
         jsonb_build_object('ddl',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','auth') AND NOT t.tgisinternal
) SELECT * FROM inventory;
COMMIT;
