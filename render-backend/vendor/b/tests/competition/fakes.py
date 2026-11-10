"""TEST_ONLY. Not imported by any application factory or production module."""
from app.competition.schemas import ProviderAdvice,Operation,Finding,ScheduleCandidate
from app.competition.budget import UsageRecord


class FakeProvider:
    mode='FAKE_OFFLINE'

    def __init__(self):
        self.calls=[];self.failure=None

    async def suggest(self,operation,payload):
        self.calls.append((operation,payload.model_dump()))
        if self.failure is not None:raise self.failure
        answer='FAKE/OFFLINE: synthetic assistant advice only.' if operation==Operation.ASSISTANT else None
        candidates=[]
        if operation==Operation.SCHEDULE:
            candidates=[ScheduleCandidate(trial_id=payload.trials[0].trial_id,
                equipment_id=payload.equipment[0].resource_id,engineer_id=payload.engineers[0].resource_id,
                suggested_window='Synthetic window; not reserved.',rationale='FAKE/OFFLINE candidate, deterministic validation required.')]
        return ProviderAdvice(summary='FAKE/OFFLINE: synthetic advisory result; no real inference.',
            findings=[Finding(severity='info',code='SYNTHETIC_ONLY',message='FAKE/OFFLINE; no business actions authorized.')],
            candidates=candidates,answer=answer,usage=UsageRecord(source='FAKE_OFFLINE',input_tokens=0,output_tokens=0,charged_micro_usd=0))
