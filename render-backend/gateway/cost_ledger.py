"""Atomic round-level SQLite reservations. Store on durable private storage.
Never delete/recreate during the approved round; no prompts or secrets stored.
"""
import json,sqlite3
from decimal import Decimal
from pathlib import Path
class BudgetLedger:
 def __init__(self,path,identity,cap):
  p=Path(path)
  if not p.is_absolute() or not p.parent.is_dir():raise ValueError('DURABLE_LEDGER_PATH_REQUIRED')
  if not isinstance(cap,Decimal) or not cap.is_finite() or cap<=0:raise ValueError('INVALID_BUDGET_CAP')
  self.path=str(p);self.identity=json.dumps([identity,str(cap)]);self.cap=cap
  with self.connect() as c:
   c.execute('CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL, reserved TEXT NOT NULL)')
   c.execute('CREATE TABLE IF NOT EXISTS attempts (trace TEXT PRIMARY KEY, engine TEXT, reserved TEXT, state TEXT, evidence TEXT)')
   c.execute('INSERT OR IGNORE INTO budget VALUES (1,?,?)',(self.identity,'0'))
   if c.execute('SELECT identity FROM budget WHERE id=1').fetchone()[0]!=self.identity:raise ValueError('ROUND_CONFIGURATION_CHANGED')
 def connect(self):return sqlite3.connect(self.path,timeout=5)
 def reserve(self,trace,engine,amount):
  if not isinstance(amount,Decimal) or not amount.is_finite() or amount<=0:raise ValueError('INVALID_RESERVATION')
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE');total=Decimal(c.execute('SELECT reserved FROM budget WHERE id=1').fetchone()[0])
   if total+amount>self.cap:raise ValueError('ROUND_BUDGET_LIMIT')
   c.execute('INSERT INTO attempts VALUES (?,?,?,?,?)',(trace,engine,str(amount),'RESERVED_UNCERTAIN','{}'))
   c.execute('UPDATE budget SET reserved=? WHERE id=1',(str(total+amount),))
 def settle(self,trace,actual,evidence):
  if not isinstance(actual,Decimal) or not actual.is_finite() or actual<0:raise ValueError('INVALID_SETTLEMENT')
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE');amount,state=c.execute('SELECT reserved,state FROM attempts WHERE trace=?',(trace,)).fetchone()
   if state!='RESERVED_UNCERTAIN' or actual>Decimal(amount):raise ValueError('INVALID_SETTLEMENT')
   total=Decimal(c.execute('SELECT reserved FROM budget WHERE id=1').fetchone()[0]);c.execute('UPDATE budget SET reserved=? WHERE id=1',(str(total-Decimal(amount)+actual),))
   c.execute('UPDATE attempts SET state=?, evidence=? WHERE trace=?',('SUCCESS',json.dumps(evidence),trace))

 def failure(self,trace,code):
  with self.connect() as c:
   c.execute('UPDATE attempts SET evidence=? WHERE trace=? AND state=?',(json.dumps({'success':False,'error_code':code,'inference':'UNCONFIRMED','cost':'RESERVATION_RETAINED'}),trace,'RESERVED_UNCERTAIN'))
