"""Explicit, bounded single-instance release; Mock remains a separate worker."""
import fcntl,hashlib,json,os,stat,time
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
import httpx
from gateway.e4_preview_provider import E4Error,E4Service,Settings
from gateway.e4_preview_ledger import Ledger,nanos
from gateway.budget_expiry_renewal import OLD_EXPIRY,NEW_EXPIRY,original_policy,verify_renewed_ledger
from gateway.e4_budget_renewal_20261116 import NEW_EXPIRY as E4_NEW_EXPIRY,original_policy as e4_original_policy,verify_renewed_ledger as verify_e4_renewal

from gateway.budget_renewal_20261231 import NEW_EXPIRY as DEC_EXPIRY,original_policy as december_original,verify_renewed_ledger as verify_december

POLICY_PATH=Path(__file__).with_name('e4_live_policy.json')
_MOUNT_SEAL=object()

@dataclass(frozen=True)
class MountProof:
 seal:object
 mount:object
 service_id:str

def policy_bytes():return POLICY_PATH.read_bytes()

def load_policy():
 raw=policy_bytes();p=json.loads(raw)
 if p['scope']!='E4_PRIVATE_PREVIEW_SYNTHETIC_ONLY' or p['model']!='gpt-6-luna':raise E4Error('APPROVED_POLICY_REQUIRED')
 if Decimal(p['per_call_usd'])>Decimal('.05') or Decimal(p['total_usd'])>Decimal('1'):raise E4Error('APPROVED_BUDGET_BOUND_EXCEEDED')
 if p['expires_at'] not in (OLD_EXPIRY,NEW_EXPIRY,E4_NEW_EXPIRY,DEC_EXPIRY) or p['max_instances']!=1 or p['max_workers']!=1:raise E4Error('APPROVED_RELEASE_BOUND_REQUIRED')
 if p['expires_at']==NEW_EXPIRY:original_policy(p,'E4')
 if p['expires_at']==E4_NEW_EXPIRY:e4_original_policy(p)
 if p['expires_at']==DEC_EXPIRY:december_original(p,'E4')
 if p['input_usd_per_million']!='0.10' or p['output_usd_per_million']!='0.50':raise E4Error('VERIFIED_PRICING_REQUIRED')
 return p,hashlib.sha256(raw).hexdigest()

def verify_mount(env,p):
 mount=Path(p['persistent_mount'])
 if env.get('RENDER')!='true' or env.get('RENDER_SERVICE_ID')!=p['render_service_id']:raise E4Error('PROTECTED_RENDER_CONTEXT_REQUIRED')
 if mount!=Path('/var/data/e4-mock') or mount.is_symlink() or not os.path.ismount(mount):raise E4Error('VERIFIED_PERSISTENT_MOUNT_REQUIRED')
 return MountProof(_MOUNT_SEAL,mount,p['render_service_id'])

def prepare_live_directory(directory):
 """Bootstrap may tighten an owned directory; never adopt another owner's state."""
 for parent in [directory,*directory.parents]:
  if parent.is_symlink():raise E4Error('LIVE_STATE_SYMLINK_DENIED')
 directory.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|getattr(os,'O_NOFOLLOW',0))
 try:
  before=os.fstat(fd)
  print(json.dumps({'event':'E4_LIVE_DIRECTORY_CHECK','directory_uid':before.st_uid,'process_uid':os.getuid(),'mode_before':oct(stat.S_IMODE(before.st_mode))}),flush=True)
  if not stat.S_ISDIR(before.st_mode) or before.st_uid!=os.getuid():raise E4Error('PRIVATE_LIVE_STATE_OWNER_REQUIRED')
  # mkdir(exist_ok=True) preserves permissions of an existing deployment directory.
  # Only this approved directory changes; never chmod/chown parents or the ledger.
  if stat.S_IMODE(before.st_mode)!=0o700:os.fchmod(fd,0o700)
  after=os.fstat(fd)
  if after.st_uid!=os.getuid() or stat.S_IMODE(after.st_mode)!=0o700:raise E4Error('PRIVATE_LIVE_STATE_REQUIRED')
  print(json.dumps({'event':'E4_LIVE_DIRECTORY_READY','mode_after':oct(stat.S_IMODE(after.st_mode))}),flush=True)
 finally:os.close(fd)

class OwnerLock:
 def __init__(self,directory):
  self.directory=Path(directory)
  for parent in [self.directory,*self.directory.parents]:
   if parent.is_symlink():raise E4Error('LIVE_STATE_SYMLINK_DENIED')
  st=self.directory.stat()
  if not self.directory.is_dir() or st.st_uid!=os.getuid() or stat.S_IMODE(st.st_mode)!=0o700:raise E4Error('PRIVATE_LIVE_STATE_REQUIRED')
  fd=os.open(self.directory/'owner.lock',os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
  metadata=os.fstat(fd)
  if metadata.st_uid!=os.getuid() or metadata.st_nlink!=1 or stat.S_IMODE(metadata.st_mode)!=0o600:os.close(fd);raise E4Error('PRIVATE_OWNER_LOCK_REQUIRED')
  self.file=os.fdopen(fd,'a+')
  try:fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:self.file.close();raise E4Error('SINGLE_LIVE_INSTANCE_ONLY') from None
 def close(self):self.file.close()

class SingleInstanceLiveLedger(Ledger):
 """No cross-instance claim: one disk, one process lock, atomic SQLite reservations."""
 require_unknown_reconciliation=True
 def __init__(self,path,identity,owner,proof):
  if not isinstance(proof,MountProof) or proof.seal is not _MOUNT_SEAL or proof.service_id!='srv-dbqssc5bedkc73ekrnf0':raise E4Error('VERIFIED_SINGLE_INSTANCE_TOPOLOGY_REQUIRED')
  if Path(path).parent.parent.parent!=proof.mount:raise E4Error('APPROVED_MOUNT_STATE_REQUIRED')
  if not isinstance(owner,OwnerLock) or owner.file.closed or Path(path).parent!=owner.directory:raise E4Error('SINGLE_INSTANCE_OWNER_REQUIRED')
  super().__init__(path,identity)
  self.owner=owner
  self.cloud_coordination_verified=True

@dataclass
class ProviderState:
 service:object=None
 ledger:object=None
 owner:object=None
 code:str='LIVE_PROVIDER_DISABLED'
 status:int=503
 initialized:bool=False
 policy_sha256:str=''
 def close(self):
  if self.service:
   self.service.executor.shutdown(wait=True)
   self.service.client.close()
  if self.owner:self.owner.close()

def settings_for(p):
 l=p['limits'];e=p['evidence']
 return Settings(model=p['model'],input_rate=Decimal(p['input_usd_per_million']),output_rate=Decimal(p['output_usd_per_million']),call_cap=Decimal(p['per_call_usd']),total_cap=Decimal(p['total_usd']),expires=datetime.fromisoformat(p['expires_at']).timestamp(),round_id=p['approval_id'],max_input=l['max_input_tokens'],max_output=l['max_output_tokens'],rate=l['calls_per_minute'],history_pairs=l['history_pairs'],max_concurrent=l['max_concurrent'],request_timeout=l['request_timeout_seconds'],approved=True,approval_reference=e['user_budget'],model_access_reference=e['model_access'],pricing_reference=e['pricing'],durable_storage_reference=e['storage'],network_reference=e['network'])

def load_provider(env,clock=time.time):
 state=ProviderState();p,digest=load_policy();state.policy_sha256=digest
 if env.get('E4_RELEASE_POLICY_SHA256')!=digest:return state
 proof=verify_mount(env,p)
 if str(env.get('LIVE_PROVIDER_ENABLED','false')).lower() not in ('false','0') or str(env.get('LIVE_AI_ENABLED','false')).lower() not in ('false','0'):raise E4Error('LEGACY_LIVE_FLAGS_MUST_REMAIN_DISABLED')
 init=env.get('E4_LIVE_LEDGER_INITIALIZE','0')
 if init not in ('0','1') or env.get('AI_SPEND_APPROVED','0') not in ('0','1'):raise E4Error('EXPLICIT_RELEASE_FLAGS_REQUIRED')
 renewed=p['expires_at'] in (NEW_EXPIRY,E4_NEW_EXPIRY,DEC_EXPIRY)
 cfg=settings_for(p);cfg.validate();ledger_cfg=settings_for(december_original(p,'E4') if p['expires_at']==DEC_EXPIRY else e4_original_policy(p) if p['expires_at']==E4_NEW_EXPIRY else original_policy(p,'E4')) if renewed else cfg;directory=Path(p['live_state_directory'])
 if renewed and init!='0':raise E4Error('RENEWAL_CANNOT_INITIALIZE_LEDGER')
 if renewed and not (directory/'budget.sqlite').is_file():raise E4Error('RENEWAL_EXISTING_LEDGER_REQUIRED')
 if directory!=Path('/var/data/e4-mock/live')/p['approval_id']:raise E4Error('APPROVED_LIVE_STATE_PATH_REQUIRED')
 expired=clock()>=cfg.expires
 if expired and (init=='1' or not directory.is_dir()):state.code='BUDGET_EXPIRED';state.status=403;return state
 if init=='1':
  prepare_live_directory(directory)
 state.owner=OwnerLock(directory)
 try:
  db=directory/'budget.sqlite'
  if not db.exists():
   if init!='1':raise E4Error('EXPLICIT_LIVE_LEDGER_INITIALIZATION_REQUIRED')
   Ledger.initialize_local_or_operator(db,cfg.identity(),cfg.total_cap,cfg.expires,1);state.initialized=True
  state.ledger=SingleInstanceLiveLedger(db,ledger_cfg.identity(),state.owner,proof)
  if p['expires_at']==DEC_EXPIRY:verify_december(state.ledger,'E4')
  elif p['expires_at']==E4_NEW_EXPIRY:verify_e4_renewal(state.ledger)
  elif renewed:verify_renewed_ledger(state.ledger,'E4')
  snap=state.ledger.snapshot()
  if snap['cap_nanos']!=nanos(cfg.total_cap) or snap['expires']!=cfg.expires or snap['max_concurrent']!=1:raise E4Error('LEDGER_POLICY_MISMATCH')
  if expired:state.code='BUDGET_EXPIRED';state.status=403;return state
  if init=='1':state.code='LIVE_LEDGER_BOOTSTRAP_ONLY';return state
  if env.get('AI_SPEND_APPROVED')!='1':return state
  if not env.get('OPENAI_API_KEY'):state.code='PROVIDER_CREDENTIAL_REQUIRED';return state
  # Explicit transport ignores inherited proxies; endpoint and TLS remain fixed.
  client=httpx.Client(timeout=httpx.Timeout(cfg.request_timeout,connect=5),follow_redirects=False,trust_env=False)
  try:
   metadata=client.get('https://api.openai.com/v1/models/'+cfg.model,headers={'Authorization':'Bearer '+env['OPENAI_API_KEY']},timeout=5)
   if metadata.status_code!=200 or metadata.json().get('id')!=cfg.model:raise E4Error('MODEL_METADATA_ACCESS_NOT_VERIFIED')
   state.service=E4Service(cfg,state.ledger,key_source=lambda:env.get('OPENAI_API_KEY',''),client=client,clock=clock)
  except Exception:client.close();raise
  state.code='CONTROLLED_LIVE_CONFIGURED_NOT_MODEL_PROOF';return state
 except Exception:
  state.close();raise
