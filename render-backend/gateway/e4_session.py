"""E4-only server capability; a conversation id is never an authorization token."""
import base64,hashlib,hmac,json,re
ACCOUNTS={'DEMO-REQUESTER':('requester',['request']),'DEMO-SUPERVISOR':('manager',['request']),'DEMO-LEVEL1':('level1',['lms']),'DEMO-LEVEL2':('level2',['lms']),'U001':('outsider',['lms']),'U003':('outsider',['lab'])}
def validate_binding(obj,now):
 if not isinstance(obj,dict) or set(obj)!={'sid','accountId','system','actor','exp'}:raise ValueError('SIGNED_SESSION_REQUIRED')
 if not isinstance(obj['sid'],str) or not re.fullmatch(r'[0-9a-f]{32}',obj['sid']):raise ValueError('SIGNED_SESSION_REQUIRED')
 if type(obj['exp']) is not int or not now*1000<obj['exp']<=now*1000+1805000:raise ValueError('SESSION_EXPIRED')
 account=ACCOUNTS.get(obj['accountId']) if isinstance(obj['accountId'],str) else None
 if not account or obj['actor']!=account[0] or obj['system'] not in account[1] or obj['actor']=='outsider':raise ValueError('AUTHORIZATION_DENIED')
 return obj

def verify_session(token,key,actor,system,now):
 try:
  if not isinstance(token,str) or len(token)>2048:raise ValueError()
  data,sig=token.split('.')
  if not re.fullmatch(r'[A-Za-z0-9_-]+',data):raise ValueError()
  expected=base64.urlsafe_b64encode(hmac.new(key.encode(),('E4_SESSION_V2.'+data).encode(),hashlib.sha256).digest()).decode().rstrip('=')
  if not hmac.compare_digest(expected,sig):raise ValueError()
  obj=validate_binding(json.loads(base64.b64decode(data+'='*((4-len(data)%4)%4),altchars=b'-_',validate=True)),now)
  if obj['actor']!=actor or obj['system']!=system:raise ValueError('AUTHORIZATION_DENIED')
  return obj
 except ValueError as e:
  if str(e) in ['AUTHORIZATION_DENIED','SESSION_EXPIRED']:raise
  raise ValueError('SIGNED_SESSION_REQUIRED') from None
 except Exception:raise ValueError('SIGNED_SESSION_REQUIRED') from None

def subject(binding):return hashlib.sha256(json.dumps(binding,sort_keys=True,separators=(',',':')).encode()).hexdigest()
