"""Prepare only an isolated, synthetic local finance database; never accepts a cloud DSN."""
import argparse,json,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'tools/prepare_profile_local.py'),'--directory',a.directory],check=True)
s=json.loads((Path(a.directory)/'LOCAL_DATABASE.json').read_text());assert s['network']=='none' and not s['published_ports'] and s['container'].startswith('dqa-business-local-')
cmd=['docker','--host=unix:///var/run/docker.sock','exec','-i',s['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U',s['owner'],'-d',s['database']]
subprocess.run(cmd,input='BEGIN;'+(root/'migrations/035_finance_v1.sql').read_text()+'\nCOMMIT;',text=True,check=True)
print('FINANCE_LOCAL_ONLY_READY')
