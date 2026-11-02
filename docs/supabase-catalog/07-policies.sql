-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'policy',format('%I.%I.%I',schemaname,tablename,policyname),to_jsonb(p)
  FROM pg_policies p WHERE schemaname='public'
) SELECT * FROM inventory;
COMMIT;
