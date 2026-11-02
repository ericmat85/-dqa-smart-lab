-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'relation'::text AS kind,
         format('%I.%I', n.nspname, c.relname) AS object_name,
         jsonb_build_object(
           'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner),
           'acl', c.relacl, 'rls_enabled', c.relrowsecurity,
           'rls_forced', c.relforcerowsecurity, 'is_partition', c.relispartition,
           'partition_key', CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END,
           'partition_bound', pg_get_expr(c.relpartbound, c.oid),
           'comment', obj_description(c.oid, 'pg_class')) AS definition
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')
) SELECT * FROM inventory;
COMMIT;
