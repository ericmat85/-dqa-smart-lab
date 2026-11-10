"""D-02 offline-only model simulation. No HTTP, SDK, credentials or usage ledger."""
from dataclasses import dataclass
from copy import deepcopy
import json
from .provider import ProviderUnavailable

SIMULATION_MARKER = 'SIMULATED_MODEL_OUTPUT'
SCENARIOS = (
    'normal','timeout','unavailable','invalid_json','schema_mismatch','missing_required',
    'hallucinated_citation','unauthorized_approval','data_mutation','unsafe_schedule',
    'empty','correlation_mismatch','rate_limit','oversized',
)
ACTIONS = {'E1':'REVIEW_FINDINGS','E2':'REVIEW_CANDIDATES','E3':'REVIEW_REPORT','E4':'READ_CITATIONS'}

@dataclass(frozen=True)
class SimulationPacket:
    marker: str
    body: str

class FakeModelProvider:
    """Deterministic synthetic responder. New simulation interface, not B Transport."""
    mode = 'fake'
    marker = SIMULATION_MARKER

    def __init__(self, scenario='normal'):
        if scenario not in SCENARIOS: raise ValueError('Unknown synthetic scenario')
        self.scenario = scenario
        self.calls = 0

    def generate(self, context):
        self.calls += 1
        scenario = self.scenario
        if scenario == 'timeout': raise TimeoutError(SIMULATION_MARKER)
        if scenario == 'unavailable': raise ProviderUnavailable(SIMULATION_MARKER)
        # Offline fault only: retain the existing unavailable error contract.
        if scenario == 'rate_limit': raise ProviderUnavailable('SIMULATED_RATE_LIMIT')
        if scenario == 'oversized': return SimulationPacket(self.marker,' ' * 100001 + '{}')
        if scenario == 'invalid_json': return SimulationPacket(self.marker,'{"marker":"SIMULATED_MODEL_OUTPUT",')
        if scenario == 'empty': return SimulationPacket(self.marker,'')
        engine=context['engine_id'];rules=context['rule_result']
        citations=deepcopy(rules.get('citations',[])) if engine=='E4' else []
        action=ACTIONS[engine]
        if engine=='E4' and rules['retrieval_status']!='FOUND': action='WITHHOLD_CONCLUSION'
        advice={'action':action,'note_codes':['HUMAN_REVIEW_REQUIRED'],
                'candidate_indices':list(range(len(rules['proposals']))) if engine=='E2' else [],
                'citations':citations}
        obj={'engine_id':engine,'correlation_id':context['correlation_id'],'advice':advice}
        if scenario == 'schema_mismatch': obj['advice']=[]
        elif scenario == 'missing_required': del obj['advice']['action']
        elif scenario == 'hallucinated_citation':
            obj['advice']['citations']=[{'ref':{'document_id':'INVENTED','version':'99','locator':'NO-SUCH-CLAUSE','digest':'invented'},'quote':'Unsupported synthetic conclusion'}]
        elif scenario == 'unauthorized_approval': obj['advice']['approve']=True
        elif scenario == 'data_mutation': obj['advice']['measurements']=[{'value':0,'original_result':'PASS'}]
        elif scenario == 'unsafe_schedule': obj['advice']['proposals']=[{'granularity':'HOUR','applied':True,'ignore_safety':True}]
        elif scenario == 'correlation_mismatch': obj['correlation_id']='WRONG-CORRELATION'
        return SimulationPacket(self.marker,json.dumps(obj,ensure_ascii=False,allow_nan=False,sort_keys=True))
