"""Bounded advisory controls. Workflow rules, permissions and evidence stay fixed."""
import json
from pathlib import Path
from gateway.e4_preview_provider import E4Error
CONTROLS=json.loads(Path(__file__).with_suffix('.json').read_text())
def controls(engine,value=None):
 fields=CONTROLS[engine];value={} if value is None else value
 if not isinstance(value,dict) or set(value)-set(fields):raise E4Error('AI_CONTROLS_INVALID',422)
 result={key:field['default'] for key,field in fields.items()}
 for key,v in value.items():
  field=fields[key]
  if field['type']=='select' and (not isinstance(v,str) or v not in field['options']):raise E4Error('AI_CONTROLS_INVALID',422)
  if field['type']=='number' and (type(v) is not int or not field['min']<=v<=field['max']):raise E4Error('AI_CONTROLS_INVALID',422)
  result[key]=v
 return result

def control_instructions(engine,value):
 value=controls(engine,value)
 detail={'concise':'Keep explanations short.','standard':'Use standard concise professional detail.','detailed':'Explain relevant evidence and limitations within the existing token and schema limits.'}[value['detail']]
 fixed='These controls only affect advisory emphasis and presentation. Always check all required evidence, preserve the fixed workflow, safety rules and source restrictions. Never claim a human action or change data.'
 if engine=='E1':return fixed+' '+detail+' Emphasis: '+{'balanced':'all review aspects','requirements':'test requirements and specifications','signatures':'signature record completeness, never authenticity','reports':'report fields and source evidence'}[value['focus']]+f". Findings must have at most {value['findings_limit']} items."
 if engine=='E2':return fixed+' '+detail+' Compare only validated candidates, emphasizing '+{'balanced':'a balanced comparison','earliest_finish':'earlier end dates','fewer_devices':'fewer equipment allocations'}[value['ranking']]+'. Do not change conditions, U, duration, people, allocations, reservations or the chosen candidate command.'
 if engine=='E3':return fixed+' '+detail+' Intended audience: '+{'technical':'engineering','management':'management summary','customer':'customer-facing explanation'}[value['tone']]+'. Always keep missing measurements, verdicts and signatures pending; this remains a draft.'
 return fixed+' '+detail+' Use '+{'plain':'plain and understandable','technical':'appropriate engineering terminology'}[value['vocabulary']]+f" language. Cite only supplied source IDs, up to {value['reference_limit']} references. Program FAQs bypass model controls and never run a model."
