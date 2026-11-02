-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
-- 僅安全角色 metadata，刻意不選 rolpassword；不讀 pg_authid。
SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
FROM pg_roles ORDER BY rolname;
SELECT pg_get_userbyid(m.roleid) AS granted_role,pg_get_userbyid(m.member) AS member,
 pg_get_userbyid(m.grantor) AS grantor,m.admin_option,
 to_jsonb(m)-'roleid'-'member'-'grantor' AS membership_options
FROM pg_auth_members m ORDER BY granted_role,member;
SELECT d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) AS object,
 pg_get_userbyid(d.refobjid) AS referenced_role
FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
 AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database());
SELECT datname,pg_get_userbyid(datdba) AS owner,datacl
FROM pg_database WHERE datname=current_database();
-- 此結果是全域角色的部分盤點，不是可還原 roles dump。
COMMIT;
