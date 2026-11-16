"""E4-only expiry renewal, no refill, no retry, no E2 access. Default is read-only."""
import argparse
import hashlib
import json
import os
import sqlite3
import stat
import time
from datetime import datetime
from pathlib import Path
from gateway import budget_expiry_renewal as previous

NEW_EXPIRY='2026-11-16T23:59:00+08:00'
REFERENCE='USER_APPROVED_E4_EXPIRY_ONLY_USD0.05_PER_CALL_USD1_CUMULATIVE_UNTIL_2026-11-16T23:59+08:00_NO_REFILL_MAX_TWO_OPERATOR_TEST_CALLS'
POLICY_SHA256='62de561954114c15500d48b45244bba5792434facefdb9ee2fb937d5c5969287'
EVENT='E4_BUDGET_EXPIRY_EXTENDED_20261116_NO_REFILL'
PATH=Path('/var/data/e4-mock/live/E4-LIVE-20261112-US1/budget.sqlite')
SPEC=previous.ENGINES['E4']
PLAN={'service_id':previous.SERVICE,'ledger_path':str(PATH),'identity':SPEC['identity'],'previous_policy_sha256':SPEC['renewed_sha256'],'new_policy_sha256':POLICY_SHA256,'old_expires':datetime.fromisoformat(previous.NEW_EXPIRY).timestamp(),'new_expires':datetime.fromisoformat(NEW_EXPIRY).timestamp(),'cap_nano_usd':1000000000,'max_concurrent':1,'action':'E4_EXPIRY_ONLY_NO_REFILL_NO_RETRY_NO_E2_ACCESS','operator_test_call_limit':2}
PLAN_SHA256=hashlib.sha256(json.dumps(PLAN,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def require(condition,code):
 if not condition:raise ValueError(code)

def original_policy(policy):
 require(hashlib.sha256(previous.canonical(policy)).hexdigest()==POLICY_SHA256,'EXACT_E4_RENEWAL_POLICY_REQUIRED')
 mid=json.loads(json.dumps(policy));mid['expires_at']=previous.NEW_EXPIRY;mid['evidence']['user_budget']=previous.NEW_REFERENCE
 require(hashlib.sha256(previous.canonical(mid)).hexdigest()==SPEC['renewed_sha256'],'PREVIOUS_E4_POLICY_BINDING_REQUIRED')
 return previous.original_policy(mid,'E4')

def validate_prior_audit(c):
 rows=c.execute('SELECT operation,detail FROM events WHERE kind=?',(previous.EVENT,)).fetchall()
 require(len(rows)==1 and rows[0][0]==previous.PLAN_SHA256,'PREVIOUS_E4_RENEWAL_AUDIT_REQUIRED')
 detail=json.loads(rows[0][1]);require(detail.get('engine')=='E4' and detail.get('plan_sha256')==previous.PLAN_SHA256 and detail.get('new_expires')==PLAN['old_expires'] and detail.get('old_expires')==previous.PLAN['old_expires'] and detail.get('cap_nano_usd')==PLAN['cap_nano_usd'],'PREVIOUS_E4_AUDIT_MISMATCH')

def validate_new_audit(c):
 rows=c.execute('SELECT operation,detail FROM events WHERE kind=?',(EVENT,)).fetchall()
 require(len(rows)==1 and rows[0][0]==PLAN_SHA256,'E4_RENEWAL_AUDIT_REQUIRED')
 d=json.loads(rows[0][1]);require(d.get('plan_sha256')==PLAN_SHA256 and d.get('engine')=='E4' and d.get('old_expires')==PLAN['old_expires'] and d.get('new_expires')==PLAN['new_expires'] and d.get('cap_nano_usd')==PLAN['cap_nano_usd'] and d.get('budget_refilled') is False and d.get('original_requests_retried') is False,'E4_RENEWAL_AUDIT_MISMATCH')

def verify_renewed_ledger(ledger):
 with ledger.connect() as c:
  validate_prior_audit(c);validate_new_audit(c)

def check_context():
 require(os.environ.get('RENDER')=='true' and os.environ.get('RENDER_SERVICE_ID')==PLAN['service_id'],'PROTECTED_RENDER_CONTEXT_REQUIRED')
 mount=Path(previous.MOUNT);require(not mount.is_symlink() and os.path.ismount(mount),'PERSISTENT_MOUNT_REQUIRED')
 policy=Path.cwd()/'gateway/e4_live_policy.json';require(hashlib.sha256(policy.read_bytes()).hexdigest() in (SPEC['renewed_sha256'],POLICY_SHA256),'DEPLOYED_E4_POLICY_MISMATCH')
 for p in [PATH,*PATH.parents]:require(not p.is_symlink(),'LEDGER_SYMLINK_DENIED')
 f,d=PATH.stat(),PATH.parent.stat();require(stat.S_ISREG(f.st_mode) and f.st_nlink==1 and f.st_uid==os.getuid() and stat.S_IMODE(f.st_mode)==0o600 and d.st_uid==os.getuid() and stat.S_IMODE(d.st_mode)==0o700,'PRIVATE_E4_LEDGER_REQUIRED')
 require(f.st_dev==mount.stat().st_dev,'PERSISTENT_E4_LEDGER_DEVICE_REQUIRED')

def renewal(approve_plan=None,now=None):
 if approve_plan is not None:require(approve_plan==PLAN_SHA256,'EXACT_PLAN_APPROVAL_REQUIRED')
 check_context();now=time.time() if now is None else now;require(PLAN['old_expires']<=now<PLAN['new_expires'],'E4_RENEWAL_WINDOW_CLOSED')
 c=sqlite3.connect(PATH.as_uri()+'?mode='+('rw' if approve_plan else 'ro'),uri=True,timeout=5)
 try:
  require(c.execute('PRAGMA user_version').fetchone()==(3,),'LEDGER_SCHEMA_MISMATCH')
  if approve_plan:c.execute('PRAGMA synchronous=FULL')
  else:c.execute('PRAGMA query_only=ON')
  c.execute('BEGIN IMMEDIATE' if approve_plan else 'BEGIN')
  rows=c.execute('SELECT identity,cap,held,spent,expires,max_concurrent FROM budget').fetchall();require(len(rows)==1,'SINGLE_E4_BUDGET_REQUIRED');before=rows[0]
  require(before[0]==PLAN['identity'] and before[1]==PLAN['cap_nano_usd'] and before[5]==1,'E4_BUDGET_BINDING_MISMATCH')
  require(all(type(n) is int and n>=0 for n in before[1:4]) and before[2]+before[3]<=before[1],'INVALID_E4_BALANCE')
  require(before[2]==0,'HELD_RESERVATION_REQUIRES_RECONCILIATION')
  require(c.execute("SELECT COUNT(*) FROM attempts WHERE active!=0 OR state IN ('UNKNOWN','RESERVED_INFLIGHT')").fetchone()==(0,),'UNRESOLVED_OR_ACTIVE_E4_OPERATION')
  validate_prior_audit(c)
  result={'plan_sha256':PLAN_SHA256,'engine':'E4','new_expires_at':NEW_EXPIRY,'cap_nano_usd':before[1],'held_nano_usd':before[2],'spent_nano_usd':before[3],'available_nano_usd':before[1]-before[2]-before[3],'budget_refilled':False,'original_requests_retried':False,'e2_accessed':False,'paid_ai_calls':0}
  if before[4]==PLAN['new_expires']:
   validate_new_audit(c);return {**result,'status':'ALREADY_RENEWED_NO_CHANGES'}
  require(before[4]==PLAN['old_expires'] and c.execute('SELECT COUNT(*) FROM events WHERE kind=?',(EVENT,)).fetchone()==(0,),'UNEXPECTED_E4_RENEWAL_STATE')
  if not approve_plan:return {**result,'status':'READ_ONLY_READY_FOR_EXPLICIT_APPROVAL'}
  changed=c.execute('UPDATE budget SET expires=? WHERE id=1 AND identity=? AND cap=? AND held=? AND spent=? AND expires=? AND max_concurrent=1',(PLAN['new_expires'],*before[:5])).rowcount
  require(changed==1,'E4_BUDGET_CHANGED_DURING_RENEWAL')
  detail={'engine':'E4','plan_sha256':PLAN_SHA256,'old_expires':before[4],'new_expires':PLAN['new_expires'],'cap_nano_usd':before[1],'held_nano_usd':before[2],'spent_nano_usd':before[3],'budget_refilled':False,'original_requests_retried':False,'actual_charge_claimed':False}
  c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(now,EVENT,PLAN_SHA256,'',json.dumps(detail,sort_keys=True)))
  after=c.execute('SELECT identity,cap,held,spent,expires,max_concurrent FROM budget').fetchone();require(after==(*before[:4],PLAN['new_expires'],before[5]),'E4_BALANCE_CONSERVATION_FAILED')
  c.commit();return {**result,'status':'E4_EXPIRY_EXTENDED_NO_REFILL_NO_RETRY'}
 except Exception:c.rollback();raise
 finally:c.close()

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--approve-plan');args=parser.parse_args()
 try:print(json.dumps(renewal(args.approve_plan),sort_keys=True))
 except (ValueError,OSError,sqlite3.Error,KeyError,json.JSONDecodeError) as e:
  code=str(e) if type(e) is ValueError and str(e).isupper() and str(e).replace('_','').isalnum() else 'SAFE_E4_RENEWAL_CHECK_FAILED'
  print(json.dumps({'status':'STOPPED','error_code':code,'paid_ai_calls':0},sort_keys=True));raise SystemExit(1) from None
if __name__=='__main__':main()
