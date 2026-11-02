-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'default_acl',format('%s/%s/%s',pg_get_userbyid(d.defaclrole),
         COALESCE(n.nspname,'<global>'),d.defaclobjtype),
         jsonb_build_object('acl',d.defaclacl)
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE n.nspname='public' OR d.defaclnamespace=0
) SELECT * FROM inventory;
COMMIT;
