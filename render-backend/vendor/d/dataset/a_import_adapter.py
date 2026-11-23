"""Pure staging export; no IndexedDB/localStorage, workflow update or XLSX creation."""
from copy import deepcopy
from validate_dataset import validate

def prepare_import(dataset):
 validate(dataset)
 requests=[]
 for r in dataset['requests']:
  requests.append({k:deepcopy(r[k]) for k in ['id','history','testItems','requester','ownerId','project','product','productCode','quantity','specification','judgementCriteria','status']})
 # Existing app's judgementCriteria is display text, so project a transparent Demo description.
 for q,r in zip(requests,dataset['requests']):
  q['judgementCriteria']='SYNTHETIC Demo only: '+'; '.join(f"{x['metric']}: {x['lower']}..{x['upper']} {x['unit']}" for x in r['judgementCriteria'])
 return {'schemaVersion':'d-ai4-staging/1.0','mode':'STAGING_ONLY_NOT_PRODUCT_DB_SCHEMA','synthetic':True,
         'requestRows':requests,'requestDetails':deepcopy(dataset['requests']),'testResults':deepcopy(dataset['testResults']),'reportDraftRows':deepcopy(dataset['reportDrafts']),
         'reportSections':deepcopy(dataset['reportSections']),'photoRequirements':deepcopy(dataset['photoReferences']),
         'writesPerformed':False,'reportStoreDirectImportAllowed':False,'workflowTransitionsPerformed':False}
