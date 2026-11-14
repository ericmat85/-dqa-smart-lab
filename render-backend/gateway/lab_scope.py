import json,re
from pathlib import Path
from gateway.e4_preview_provider import E4Error
RULES=json.loads(Path(__file__).with_name('lab_scope.json').read_text())
def ensure_lab_scope(question,document=False):
 text=re.sub(r'DQA\s*Smart\s*Lab','實驗室系統',str(question),flags=re.I).strip()
 for key,code in [('identity','IDENTITY_SCOPE_DENIED'),('unbuilt','DQA_NOT_AVAILABLE'),('outside','NON_LAB_SCOPE_DENIED')]:
  if re.search(RULES[key],text,re.I):raise E4Error(code,422)
 if not document and not re.search(RULES['laboratory'],text,re.I) and not re.search(RULES['neutral'],text,re.I):raise E4Error('NON_LAB_SCOPE_DENIED',422)
