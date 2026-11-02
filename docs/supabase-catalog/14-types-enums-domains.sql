-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner) AS owner,
 t.typacl,format_type(t.typbasetype,t.typtypmod) AS domain_base,
 t.typnotnull,t.typdefault,t.typcollation::regcollation AS collation,
 t.typrelid::regclass AS composite_relation,
 (SELECT jsonb_agg(jsonb_build_object('value',e.enumlabel,'order',e.enumsortorder)
 ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid) AS enum_values,
 (SELECT jsonb_agg(pg_get_constraintdef(c.oid,true) ORDER BY c.conname)
 FROM pg_constraint c WHERE c.contypid=t.oid) AS domain_constraints,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'position',a.attnum) ORDER BY a.attnum) FROM pg_attribute a
 WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped) AS attributes,
 (SELECT to_jsonb(r) FROM pg_range r WHERE r.rngtypid=t.oid) AS range_metadata
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='public' ORDER BY t.typname;
-- pg_range JSON 內 OID 需在來源解析名稱，不能直接跨環境比較。
COMMIT;
