-- Read-only catalogs only. One result object also works through Management API.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
 'database',current_database(),'migration_role',current_user,
 'postgres_version',current_setting('server_version'),
 'existing_business_schema',to_regnamespace('dqa_business'),
 'existing_helper_schema',to_regnamespace('dqa_private'),
 'platform_users',to_regclass('auth.users'),
 'platform_identity',to_regprocedure('auth.uid()'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN (current_user,'anon','authenticated')),
 'existing_table_counts',(SELECT jsonb_object_agg(schema_name,table_count) FROM (SELECT n.nspname AS schema_name,count(*) AS table_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','dqa_business','dqa_private') GROUP BY n.nspname) t),
 'btree_gist',(SELECT jsonb_build_object('version',e.extversion,'schema',n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist'),
 'public_definition_fingerprint',(SELECT md5(coalesce(string_agg(object_definition,E'\n' ORDER BY object_definition),'')) FROM (
   SELECT jsonb_build_array('table',c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text AS object_definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
   UNION ALL SELECT jsonb_build_array('column',c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public'
   UNION ALL SELECT jsonb_build_array('constraint',c.relname,k.conname,pg_get_constraintdef(k.oid))::text FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   UNION ALL SELECT jsonb_build_array('index',tablename,indexname,indexdef)::text FROM pg_indexes WHERE schemaname='public'
   UNION ALL SELECT jsonb_build_array('policy',tablename,policyname,roles,cmd,qual,with_check)::text FROM pg_policies WHERE schemaname='public'
   UNION ALL SELECT jsonb_build_array('function',p.proname,pg_get_function_identity_arguments(p.oid),p.proacl,pg_get_functiondef(p.oid))::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p','w')
   UNION ALL SELECT jsonb_build_array('trigger',c.relname,t.tgname,pg_get_triggerdef(t.oid))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
 ) definitions)
) AS preflight;
COMMIT;
