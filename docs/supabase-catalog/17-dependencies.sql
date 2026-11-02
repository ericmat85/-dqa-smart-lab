-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
-- pg_depend 以 public 物件任一端為範圍，必要時擴展到 Auth handler 相依閉包。
SELECT d.deptype,a.type AS object_type,a.schema AS object_schema,a.identity AS object_identity,
 b.type AS referenced_type,b.schema AS referenced_schema,b.identity AS referenced_identity
FROM pg_depend d
CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) a
CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) b
WHERE a.schema='public' OR b.schema='public'
ORDER BY a.identity,b.identity,d.deptype;
-- 大量結果應依 object_schema/object_identity 分片；動態 SQL 另人工檢查。
COMMIT;
