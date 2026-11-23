"""Create an isolated synthetic runtime through migration 033; never accepts a DSN."""
import argparse,json,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'tools/prepare_local.py'),'--directory',a.directory],check=True)
s=json.loads((Path(a.directory)/'LOCAL_DATABASE.json').read_text())
assert s['network']=='none' and not s['published_ports'] and s['container'].startswith('dqa-business-local-')
cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
def sql(text):subprocess.run(cmd,input=text,text=True,check=True,capture_output=True)
# Platform stand-ins only: no storage API or external auth service is contacted.
sql('CREATE ROLE service_role; ALTER TABLE auth.users ADD COLUMN banned_until timestamptz; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated,anon; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;')
for f in sorted((root/'migrations').glob('*.sql')):
 if 4<=int(f.name[:3])<=33:
  sql('BEGIN;'+f.read_text()+'\nCOMMIT;');print(f.name)
sql("UPDATE dqa_business.memberships SET login_email='local-'||replace(auth_user_id::text,'-','')||'@example.invalid' WHERE coalesce(login_email,'')='';")
sql('UPDATE auth.users u SET email=m.login_email,email_confirmed_at=clock_timestamp() FROM dqa_business.memberships m WHERE m.auth_user_id=u.id;')
print('LOCAL_ONLY_READY')
