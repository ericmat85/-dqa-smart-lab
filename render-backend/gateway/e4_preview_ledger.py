"""Local SQLite coordination and accounting; cloud storage/coordinator NOT verified."""
import json,os,sqlite3,stat
from contextlib import contextmanager
from decimal import Decimal,ROUND_CEILING
from pathlib import Path
SCALE=Decimal(1000000000)
def nanos(value):
 d=Decimal(str(value))
 if not d.is_finite() or d<0:raise ValueError('INVALID_COST')
 return int((d*SCALE).to_integral_value(rounding=ROUND_CEILING))
class Ledger:
 cloud_coordination_verified=False  # Local SQLite is not a verified cross-instance cloud coordinator.
 require_unknown_reconciliation=False
 @staticmethod
 def initialize_local_or_operator(path,identity,cap,expires,max_concurrent=1):
  p=Path(path)
  if not p.is_absolute() or not p.parent.is_dir() or p.exists() or max_concurrent not in (1,2):raise ValueError('NEW_PRIVATE_LEDGER_REQUIRED')
  fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
  c=sqlite3.connect(p)
  try:
   c.executescript('PRAGMA user_version=3;CREATE TABLE budget(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL,cap INTEGER NOT NULL,expires REAL NOT NULL,held INTEGER NOT NULL,spent INTEGER NOT NULL,max_concurrent INTEGER NOT NULL);CREATE TABLE attempts(trace TEXT PRIMARY KEY,session_hash TEXT NOT NULL,request_hash TEXT NOT NULL,created REAL NOT NULL,reserved INTEGER NOT NULL,state TEXT NOT NULL,evidence TEXT NOT NULL,active INTEGER NOT NULL,lease_until REAL NOT NULL);CREATE TABLE sessions(sid TEXT PRIMARY KEY,account TEXT NOT NULL,system TEXT NOT NULL,actor TEXT NOT NULL,expires REAL NOT NULL,generation INTEGER NOT NULL,revoked INTEGER NOT NULL);CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,at REAL NOT NULL,kind TEXT NOT NULL,operation TEXT NOT NULL,sid TEXT NOT NULL,detail TEXT NOT NULL);')
   c.execute('INSERT INTO budget VALUES(1,?,?,?,?,?,?)',(identity,nanos(cap),expires,0,0,max_concurrent));c.commit()
  finally:c.close()
 def __init__(self,path,identity):
  self.path=Path(path);self.identity=identity
  if not self.path.is_absolute():raise ValueError('ABSOLUTE_LEDGER_REQUIRED')
  for p in [self.path,*self.path.parents]:
   if p.is_symlink():raise ValueError('LEDGER_SYMLINK_DENIED')
  s=self.path.stat();d=self.path.parent.stat()
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_nlink!=1 or s.st_mode&0o077 or d.st_uid!=os.getuid() or d.st_mode&0o077:raise ValueError('PRIVATE_LEDGER_PERMISSIONS_REQUIRED')
  with self.connect() as c:
   if c.execute('PRAGMA user_version').fetchone()[0]!=3:raise ValueError('LEDGER_MIGRATION_REQUIRES_REVIEW')
   if c.execute('SELECT identity FROM budget WHERE id=1').fetchone()!=(identity,):raise ValueError('LEDGER_IDENTITY_MISMATCH')
 @contextmanager
 def connect(self):
  c=sqlite3.connect(self.path.as_uri()+'?mode=rw',uri=True,timeout=5);c.execute('PRAGMA synchronous=FULL')
  try:yield c;c.commit()
  except Exception:c.rollback();raise
  finally:c.close()
 def bind_session(self,binding,now):
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   if now*1000>=binding['exp']:raise ValueError('SESSION_EXPIRED')
   row=c.execute('SELECT account,system,actor,expires,generation,revoked FROM sessions WHERE sid=?',(binding['sid'],)).fetchone()
   expected=(binding['accountId'],binding['system'],binding['actor'],binding['exp'])
   if row:
    if row[:4]!=expected:raise ValueError('SESSION_BINDING_MISMATCH')
    if row[5]:raise ValueError('SESSION_REVOKED')
    return row[4]
   c.execute('INSERT INTO sessions VALUES(?,?,?,?,?,0,0)',(binding['sid'],*expected));return 0
 def control(self,binding,now,action):
  self.bind_session(binding,now)
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   if c.execute('SELECT revoked FROM sessions WHERE sid=?',(binding['sid'],)).fetchone()[0]:raise ValueError('SESSION_REVOKED')
   c.execute('UPDATE sessions SET generation=generation+1,revoked=MAX(revoked,?) WHERE sid=?',(int(action=='logout'),binding['sid']))
   self._event(c,now,'SESSION_REVOKED' if action=='logout' else 'CONTEXT_CLEARED','',binding['sid'],{})
 @contextmanager
 def session_guard(self,binding,now,generation):
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   row=c.execute('SELECT account,system,actor,expires,generation,revoked FROM sessions WHERE sid=?',(binding['sid'],)).fetchone()
   if not row or row[:4]!=(binding['accountId'],binding['system'],binding['actor'],binding['exp']) or row[5] or now*1000>=row[3]:raise ValueError('SESSION_NO_LONGER_VALID')
   if row[4]!=generation:raise ValueError('SESSION_CONTEXT_CHANGED')
   yield
 def _event(self,c,now,kind,operation,sid,detail):
  return c.execute('INSERT INTO events(at,kind,operation,sid,detail) VALUES(?,?,?,?,?)',(now,kind,operation,sid,json.dumps(detail,sort_keys=True))).lastrowid
 def _authorize_session(self,c,binding,now,generation):
  row=c.execute('SELECT account,system,actor,expires,generation,revoked FROM sessions WHERE sid=?',(binding['sid'],)).fetchone()
  if not row or row[:4]!=(binding['accountId'],binding['system'],binding['actor'],binding['exp']) or row[5] or now*1000>=row[3]:raise ValueError('SESSION_REVOKED_OR_EXPIRED')
  if row[4]!=generation:raise ValueError('SESSION_CONTEXT_CHANGED')
 def authorize_dispatch(self,operation,binding,generation,now,cancelled=False,dispatch_guard=None):
  error=None
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   row=c.execute('SELECT reserved,state,evidence FROM attempts WHERE trace=?',(operation,)).fetchone()
   if not row or row[1]!='RESERVED_INFLIGHT':raise ValueError('REQUEST_ALREADY_SEEN')
   evidence=json.loads(row[2])
   if evidence.get('dispatch_sequence'):raise ValueError('REQUEST_ALREADY_DISPATCHED')
   try:
    self._authorize_session(c,binding,now,generation)
    if now>=c.execute('SELECT expires FROM budget WHERE id=1').fetchone()[0]:raise ValueError('BUDGET_EXPIRED')
    if cancelled:raise ValueError('REQUEST_CANCELLED_NOT_SENT')
    if dispatch_guard is not None:dispatch_guard(c)
   except ValueError as exc:error=str(exc)
   if error:
    seq=self._event(c,now,'DISPATCH_REJECTED',operation,binding['sid'],{'error_code':error})
    evidence.update(error_code=error,outcome='NOT_SENT',dispatch_sequence=seq)
    c.execute('UPDATE budget SET held=held-? WHERE id=1',(row[0],))
    c.execute('UPDATE attempts SET state=?,active=0,evidence=? WHERE trace=?',('REJECTED_NOT_SENT',json.dumps(evidence),operation))
   else:
    seq=self._event(c,now,'DISPATCH_GRANTED',operation,binding['sid'],{'generation':generation})
    evidence.update(dispatch_sequence=seq,session_generation=generation)
    c.execute('UPDATE attempts SET evidence=? WHERE trace=?',(json.dumps(evidence),operation))
  if error:raise ValueError(error)
  return seq
 def events(self,operation=None):
  with self.connect() as c:
   rows=c.execute('SELECT sequence,kind,operation,sid,detail FROM events'+(' WHERE operation=?' if operation else '')+' ORDER BY sequence',(() if operation is None else (operation,))).fetchall()
   return [dict(sequence=r[0],kind=r[1],operation=r[2],sid=r[3],detail=json.loads(r[4])) for r in rows]
 def recover_unknown(self,now):
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   for trace,evidence in c.execute('SELECT trace,evidence FROM attempts WHERE active=1 AND lease_until<=? AND state=?',(now,'RESERVED_INFLIGHT')).fetchall():
    record=json.loads(evidence);record.update(error_code='WORKER_RECOVERY_REQUIRED',outcome='UNKNOWN',reservation='HELD',at=now)
    c.execute('UPDATE attempts SET state=?,evidence=? WHERE trace=?',('UNKNOWN',json.dumps(record),trace))
 def denied(self,trace,session_hash,request_hash,code,now):
  with self.connect() as c:
   c.execute('INSERT OR IGNORE INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',(trace,session_hash,request_hash,now,0,'REJECTED_NOT_SENT',json.dumps({'error_code':code,'outcome':'NOT_SENT','at':now}),0,0))
 def reserve(self,trace,session_hash,amount,now,rate,request_hash='',lease_seconds=25,trace_id=None,binding=None,generation=None,reservation_guard=None):
  self.recover_unknown(now)
  n=nanos(amount)
  if n<=0:raise ValueError('INVALID_RESERVATION')
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   if binding is not None:self._authorize_session(c,binding,now,generation)
   identity,cap,expires,held,spent,maximum=c.execute('SELECT identity,cap,expires,held,spent,max_concurrent FROM budget WHERE id=1').fetchone()
   if identity!=self.identity:raise ValueError('LEDGER_IDENTITY_MISMATCH')
   if now>=expires:raise ValueError('BUDGET_EXPIRED')
   if self.require_unknown_reconciliation and c.execute("SELECT COUNT(*) FROM attempts WHERE state='UNKNOWN'").fetchone()[0]:raise ValueError('OUTCOME_RECONCILIATION_REQUIRED')
   prior=c.execute('SELECT session_hash,request_hash,state FROM attempts WHERE trace=?',(trace,)).fetchone()
   if prior:
    if prior[:2]!=(session_hash,request_hash):raise ValueError('REQUEST_ID_CONFLICT')
    raise ValueError('REQUEST_ALREADY_COMPLETED' if prior[2]=='SUCCESS' else 'REQUEST_OUTCOME_UNKNOWN' if prior[2]=='UNKNOWN' else 'REQUEST_ALREADY_SEEN')
   if c.execute('SELECT COUNT(*) FROM attempts WHERE active=1 AND lease_until<=?',(now,)).fetchone()[0]:raise ValueError('CONCURRENCY_RECOVERY_REQUIRED')
   if c.execute('SELECT COUNT(*) FROM attempts WHERE active=1').fetchone()[0]>=maximum:raise ValueError('SERVICE_BUSY')
   if c.execute('SELECT COUNT(*) FROM attempts WHERE created>? AND reserved>0',(now-60,)).fetchone()[0]>=rate:raise ValueError('RATE_LIMIT')
   if held+spent+n>cap:raise ValueError('TOTAL_BUDGET_LIMIT')
   if reservation_guard is not None:reservation_guard(c,n)
   c.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?)',(trace,session_hash,request_hash,now,n,'RESERVED_INFLIGHT',json.dumps({'trace_id':trace_id or trace,'outcome':'INFLIGHT'}),1,now+lease_seconds))
   c.execute('UPDATE budget SET held=held+? WHERE id=1',(n,))
   if binding is not None:
    seq=self._event(c,now,'RESERVATION_GRANTED',trace,binding['sid'],{'generation':generation})
    record={'trace_id':trace_id or trace,'outcome':'INFLIGHT','authorization_sequence':seq}
    c.execute('UPDATE attempts SET evidence=? WHERE trace=?',(json.dumps(record),trace))
 def unknown(self,trace,code,now):
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   row=c.execute('SELECT evidence FROM attempts WHERE trace=?',(trace,)).fetchone();record=json.loads(row[0]) if row else {}
   record.update(error_code=code,outcome='UNKNOWN',reservation='HELD',at=now)
   c.execute('UPDATE attempts SET state=?,evidence=? WHERE trace=? AND state=?',('UNKNOWN',json.dumps(record),trace,'RESERVED_INFLIGHT'))
 def transport_done(self,trace):
  with self.connect() as c:c.execute('UPDATE attempts SET active=0 WHERE trace=?',(trace,))
 def settle(self,trace,cost,evidence):
  n=nanos(cost)
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT reserved,state FROM attempts WHERE trace=?',(trace,)).fetchone()
   if not row or row[1]!='RESERVED_INFLIGHT' or n>row[0]:raise ValueError('INVALID_SETTLEMENT')
   c.execute('UPDATE budget SET held=held-?,spent=spent+? WHERE id=1',(row[0],n))
   c.execute('UPDATE attempts SET state=?,evidence=? WHERE trace=?',('SUCCESS',json.dumps(evidence,sort_keys=True),trace))
 def settle_rejected_output(self,trace,cost,evidence,code,now):
  """Account verified usage while refusing the output; never mark it successful."""
  if code not in ('READONLY_OUTPUT_WRITE_CLAIM_REJECTED','REPORT_DRAFT_UNSUPPORTED_RESULT_REJECTED','E2_OUTPUT_REJECTED'):raise ValueError('INVALID_OUTPUT_REJECTION')
  if evidence.get('request_id')!=trace or Decimal(evidence.get('cost_usd','NaN'))!=Decimal(cost):raise ValueError('INVALID_USAGE_EVIDENCE')
  n=nanos(cost)
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   row=c.execute('SELECT reserved,state,active FROM attempts WHERE trace=?',(trace,)).fetchone()
   if not row or row[1]!='RESERVED_INFLIGHT' or row[2] or n>row[0]:raise ValueError('INVALID_REJECTED_OUTPUT_SETTLEMENT')
   if c.execute('SELECT COUNT(*) FROM events WHERE operation=? AND kind=?',(trace,'DISPATCH_GRANTED')).fetchone()[0]!=1:raise ValueError('DISPATCH_EVIDENCE_REQUIRED')
   held,spent,cap=c.execute('SELECT held,spent,cap FROM budget WHERE id=1').fetchone()
   if held<row[0] or spent+n>cap:raise ValueError('INVALID_BUDGET_ACCOUNTING')
   record={**evidence,'error_code':code,'outcome':'KNOWN_USAGE_OUTPUT_REJECTED','output_released':False,'accounted_at':now}
   c.execute('UPDATE budget SET held=held-?,spent=spent+? WHERE id=1',(row[0],n))
   c.execute('UPDATE attempts SET state=?,evidence=? WHERE trace=?',('OUTPUT_REJECTED_ACCOUNTED',json.dumps(record,sort_keys=True),trace))
   self._event(c,now,'OUTPUT_REJECTED_USAGE_ACCOUNTED',trace,'',{'error_code':code,'cost_nanos':n,'reserved_nanos':row[0],'output_released':False})
 def snapshot(self):
  with self.connect() as c:
   r=c.execute('SELECT cap,expires,held,spent,max_concurrent FROM budget WHERE id=1').fetchone()
   return dict(zip(['cap_nanos','expires','held_nanos','spent_nanos','max_concurrent'],r))
 def attempt(self,trace):
  with self.connect() as c:
   r=c.execute('SELECT state,evidence,active FROM attempts WHERE trace=?',(trace,)).fetchone()
   return None if r is None else {'state':r[0],'evidence':json.loads(r[1]),'active':bool(r[2])}
