-- 未執行的唯讀查詢稿；人工檢查後才可在 Dashboard 執行。
-- 不代表完整 dump。必要時以 schema/name/OID 範圍分片並核對輸出完整性。
-- 函式本文、defaults、comments 可能含秘密；先本機審查再分享。
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
-- 只適用 PostgreSQL 15+；先確認 server major，不支援時記錄 N/A。
SELECT p.pubname,n.nspname FROM pg_publication_namespace pn
JOIN pg_publication p ON p.oid=pn.pnpubid JOIN pg_namespace n ON n.oid=pn.pnnspid
ORDER BY p.pubname,n.nspname;
COMMIT;
