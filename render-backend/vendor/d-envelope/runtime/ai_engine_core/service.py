"""Single isolated entry point. INTERNAL_DRAFT_NOT_APPROVED; never dispatch real providers."""
from copy import deepcopy
from datetime import datetime, timezone
from .models import (EngineRequest, EngineResponse, EngineError, EngineMetadata,
                     HumanReviewRequirement, ValidationError, require, text, digest,
                     SCHEMA_VERSION)
from .engines import ENGINES
from .provider import ProviderProtocol, ProviderUnavailable

FORBIDDEN = frozenset({'approve','auto_approve','complete_technical_review','write_schedule','mutate_raw','forge_signature','force_pass'})

def guard_actions(value):
    if isinstance(value,dict):
        for key,item in value.items():
            require(not (key in FORBIDDEN and item),key,'POLICY_REJECTED')
            guard_actions(item)
    elif isinstance(value,list):
        for item in value:guard_actions(item)

class EngineCore:
    def __init__(self, provider: ProviderProtocol | None = None):
        self.provider = provider

    def run(self, raw, *, actor_id='OFFLINE_CALLER', occurred_at=None):
        # No authentication claim: actor_id is an internal audit label only.
        snapshot=deepcopy(raw)
        refs=(); result=None; errors=(); warnings=[]; metadata=EngineMetadata()
        human=HumanReviewRequirement(); req=None
        engine_id=raw.get('engine_id','UNKNOWN') if isinstance(raw,dict) else 'UNKNOWN'
        correlation=raw.get('correlation_id') if isinstance(raw,dict) else None
        correlation=correlation if text(correlation) else 'UNASSIGNED'
        request_id=raw.get('request_id') if isinstance(raw,dict) else None
        request_id=request_id if text(request_id) else 'UNASSIGNED'
        timestamp=occurred_at or datetime.now(timezone.utc).isoformat()
        try:
            require(text(actor_id),'actor_id')
            require(text(timestamp),'occurred_at')
            try: parsed=datetime.fromisoformat(timestamp)
            except ValueError: raise ValidationError('INVALID_INPUT','occurred_at') from None
            require(parsed.tzinfo is not None and parsed.utcoffset() is not None,'occurred_at')
            # Reject non-JSON and nonfinite values before any engine or provider.
            digest(snapshot)
            req=EngineRequest.parse(snapshot); refs=req.source_refs
            guard_actions(req.request_payload)
            if req.engine_id=='E1' and req.request_payload.get('technical_review') in ('PASS','FAIL','UNKNOWN'):
                human=HumanReviewRequirement(technical_review_status=req.request_payload['technical_review'])
            result,warnings=ENGINES[req.engine_id](req.request_payload,refs)
            if self.provider is not None:
                require(getattr(self.provider,'mode',None)=='fake','provider.mode','POLICY_REJECTED')
                meta=getattr(self.provider,'metadata',None)
                require(isinstance(meta,EngineMetadata) and meta.adapter_mode=='fake','provider.metadata','POLICY_REJECTED')
                require(all(text(getattr(meta,k)) for k in ('provider','model_id','model_version','prompt_version')) and isinstance(meta.parameters,dict),'provider.metadata')
                digest(meta.parameters)
                # Interface exercised only with injected fake. No core data is
                # entrusted to a provider-owned mutable object.
                metadata=deepcopy(meta)
                advice=self.provider.suggest(req.engine_id,deepcopy(result))
                require(isinstance(advice,str),'provider_output')
                # Free text is intentionally not admitted as a technical result,
                # citation, approval, measurement or report disposition.
                warnings.append('UNVERIFIED_PROVIDER_TEXT_NOT_USED')
            # Validate before leaving the error boundary. A bad internal result
            # must become a structured rejection, never escape final validation.
            from .validation import validate_result
            digest(result)
            validate_result(req.engine_id,result,refs,human)
        except ValidationError as exc:
            errors=(EngineError(exc.code,exc.field),);result=None
        except TimeoutError:
            errors=(EngineError('TIMEOUT',retryable=True),);result=None
        except ProviderUnavailable:
            errors=(EngineError('MODEL_UNAVAILABLE',retryable=True),);result=None
        except (TypeError,ValueError,OverflowError):
            errors=(EngineError('INVALID_INPUT'),);result=None
        except Exception:
            # Do not echo exception messages, provider payload or sensitive data.
            errors=(EngineError('INTERNAL_ERROR'),);result=None
        try: input_digest=digest(snapshot)
        except (TypeError,ValueError,OverflowError): input_digest=digest({'invalid_input':True})
        audit={'actor_id':actor_id if text(actor_id) else 'INVALID_CALLER','action':'OFFLINE_ADVISE',
               'input_digest':input_digest,'output_digest':digest(result),'policy_version':'D01_RULE_NOT_APPROVED',
               'occurred_at':timestamp if text(timestamp) else 'INVALID_TIMESTAMP','source_versions':[ref.version for ref in refs]}
        # Invalid identity is represented without echoing arbitrary structured data.
        engine_id=engine_id if isinstance(engine_id,str) and engine_id in ENGINES else 'UNKNOWN'
        response=EngineResponse(engine_id,SCHEMA_VERSION,correlation,request_id,'REJECTED' if errors else 'ADVISORY',
                                result,errors,tuple(warnings),refs,metadata,audit,human)
        response.validate()
        return response
