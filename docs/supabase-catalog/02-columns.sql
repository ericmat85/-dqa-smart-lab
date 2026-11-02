-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
WITH inventory AS (
  SELECT 'column', format('%I.%I.%I', n.nspname,c.relname,a.attname),
         jsonb_build_object('position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
           'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
           'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl,
           'collation',co.collname,'comment',col_description(c.oid,a.attnum))
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
  LEFT JOIN pg_collation co ON co.oid=a.attcollation
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    AND a.attnum>0 AND NOT a.attisdropped
) SELECT * FROM inventory;
COMMIT;
