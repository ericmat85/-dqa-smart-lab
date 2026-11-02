-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
-- ACL 展開保留 NULL 的預設語意；涵蓋 public、auth trigger、event trigger handlers。
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
 pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable,
 p.proacl IS NULL AS uses_default_acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
WHERE p.prokind IN ('f','p') AND (n.nspname='public'
 OR p.oid IN (SELECT evtfoid FROM pg_event_trigger)
 OR p.oid IN (SELECT t.tgfoid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='auth' AND NOT t.tgisinternal))
ORDER BY n.nspname,p.proname,arguments,grantee;
-- 有效 EXECUTE 還需對實際使用角色以 has_function_privilege 檢查並追蹤 membership。
-- search_path 未設定時必須檢查 session/database/role 預設與不可信 schema CREATE 能力。
COMMIT;
