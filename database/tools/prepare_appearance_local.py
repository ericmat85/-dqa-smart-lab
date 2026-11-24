"""Prepare isolated synthetic UI-color tests through migration 036; never accepts a DSN."""
import argparse,json,subprocess,sys
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True);args=parser.parse_args();root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'tools/prepare_finance_local.py'),'--directory',args.directory],check=True)
state=json.loads((Path(args.directory)/'LOCAL_DATABASE.json').read_text());assert state['network']=='none' and not state['published_ports'] and state['container'].startswith('dqa-business-local-')
command=['docker','--host=unix:///var/run/docker.sock','exec','-i',state['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U',state['owner'],'-d',state['database']]
subprocess.run(command,input='BEGIN;'+(root/'migrations/036_workspace_appearance.sql').read_text()+'\nCOMMIT;',text=True,check=True)
print('APPEARANCE_LOCAL_ONLY_READY')
