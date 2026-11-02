-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT pn.nspname AS parent_schema,p.relname AS parent,
 cn.nspname AS child_schema,c.relname AS child,i.inhseqno,c.relispartition,
 pg_get_partkeydef(p.oid) AS parent_partition_key,
 pg_get_expr(c.relpartbound,c.oid) AS child_bound
FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent
JOIN pg_namespace pn ON pn.oid=p.relnamespace
JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
WHERE pn.nspname='public' OR cn.nspname='public'
ORDER BY pn.nspname,p.relname,i.inhseqno,cn.nspname,c.relname;
COMMIT;
