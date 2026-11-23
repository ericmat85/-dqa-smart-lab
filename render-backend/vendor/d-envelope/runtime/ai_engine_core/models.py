"""INTERNAL_DRAFT_NOT_APPROVED. Framework-neutral internal data models."""
from dataclasses import dataclass, field, asdict
from typing import Any
import hashlib
import json
import math
from datetime import date

CONTRACT_STATUS = 'INTERNAL_DRAFT_NOT_APPROVED'
RULE_STATUS = 'RULE_NOT_APPROVED'
SCHEMA_VERSION = '0.1.0-draft'
ERROR_CODES = frozenset({'INVALID_INPUT','MISSING_REQUIRED_FIELD','SOURCE_NOT_FOUND','MODEL_UNAVAILABLE','TIMEOUT','POLICY_REJECTED','INTERNAL_ERROR'})

class ValidationError(ValueError):
    def __init__(self, code, field=None):
        self.code, self.field = code, field
        super().__init__(code)

def require(ok, field, code='INVALID_INPUT'):
    if not ok:
        raise ValidationError(code, field)

def text(value):
    return isinstance(value, str) and bool(value.strip())

def number(value):
    return type(value) in (int, float) and math.isfinite(value)

def integer(value):
    return type(value) is int and value > 0

def calendar_date(value):
    require(isinstance(value, str) and len(value) == 10, 'date')
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValidationError('INVALID_INPUT', 'date') from None
    require(parsed.isoformat() == value, 'date')
    return parsed

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()).hexdigest()

def required(mapping, keys):
    require(isinstance(mapping, dict), 'object')
    for key in keys:
        require(key in mapping and mapping[key] is not None and mapping[key] != '', key, 'MISSING_REQUIRED_FIELD')

@dataclass(frozen=True)
class SourceReference:
    document_id: str
    version: str
    locator: str
    digest: str

    @classmethod
    def parse(cls, obj):
        require(isinstance(obj, dict), 'source_refs', 'SOURCE_NOT_FOUND')
        require(all(text(obj.get(k)) for k in ('document_id', 'version', 'locator', 'digest')), 'source_refs', 'SOURCE_NOT_FOUND')
        return cls(**{k:obj[k] for k in ('document_id', 'version', 'locator', 'digest')})

@dataclass(frozen=True)
class EngineError:
    code: str
    field: str | None = None
    message: str = 'Offline core request rejected; consult code and field.'
    retryable: bool = False

@dataclass(frozen=True)
class HumanReviewRequirement:
    required: bool = True
    approval_status: str = 'PENDING_HUMAN'
    technical_review_status: str = 'UNKNOWN'
    can_approve: bool = False

@dataclass(frozen=True)
class EngineMetadata:
    provider: str = 'NONE'
    model_id: str = 'RULES_ONLY'
    model_version: str = 'd01'
    prompt_version: str = 'NONE'
    adapter_mode: str = 'offline_rules'
    parameters: dict = field(default_factory=dict)

@dataclass(frozen=True)
class EngineRequest:
    engine_id: str
    schema_version: str
    correlation_id: str
    request_id: str
    request_payload: dict
    source_refs: tuple[SourceReference, ...]

    @classmethod
    def parse(cls, obj):
        required(obj, ('engine_id', 'schema_version', 'correlation_id', 'request_id', 'request_payload', 'source_refs'))
        require(obj['engine_id'] in ('E1','E2','E3','E4'), 'engine_id')
        require(obj['schema_version'] == SCHEMA_VERSION, 'schema_version')
        for key in ('correlation_id','request_id'):
            require(text(obj[key]), key)
        require(isinstance(obj['request_payload'], dict), 'request_payload')
        require(isinstance(obj['source_refs'], list), 'source_refs', 'SOURCE_NOT_FOUND')
        refs = tuple(SourceReference.parse(ref) for ref in obj['source_refs'])
        require(bool(refs), 'source_refs', 'SOURCE_NOT_FOUND')
        return cls(obj['engine_id'], obj['schema_version'], obj['correlation_id'], obj['request_id'], obj['request_payload'], refs)

@dataclass(frozen=True)
class EngineResponse:
    engine_id: str
    schema_version: str
    correlation_id: str
    request_id: str
    status: str
    result_payload: dict | None
    errors: tuple[EngineError, ...]
    warnings: tuple[str, ...]
    source_refs: tuple[SourceReference, ...]
    model_metadata: EngineMetadata
    audit_metadata: dict
    requires_human_review: HumanReviewRequirement
    contract_status: str = CONTRACT_STATUS
    rule_status: str = RULE_STATUS

    def to_dict(self):
        # Return a detached value; callers never receive core input ownership.
        return json.loads(json.dumps(asdict(self), allow_nan=False))

    def validate(self):
        require(self.schema_version == SCHEMA_VERSION and text(self.correlation_id) and text(self.request_id) and self.engine_id in ('E1','E2','E3','E4','UNKNOWN'), 'response_identity')
        require(self.contract_status == CONTRACT_STATUS and self.rule_status == RULE_STATUS, 'policy', 'POLICY_REJECTED')
        h = self.requires_human_review
        require(h.required is True and h.can_approve is False and h.approval_status == 'PENDING_HUMAN' and h.technical_review_status in ('PASS','FAIL','UNKNOWN'), 'human_review', 'POLICY_REJECTED')
        require(self.status in ('ADVISORY','REJECTED'), 'status')
        if self.status == 'ADVISORY':
            require(not self.errors and isinstance(self.result_payload, dict) and bool(self.source_refs), 'success')
        else:
            require(bool(self.errors) and self.result_payload is None, 'rejection')
        for err in self.errors:
            require(isinstance(err, EngineError) and err.code in ERROR_CODES and text(err.message) and type(err.retryable) is bool and (err.field is None or text(err.field)), 'errors')
        require(isinstance(self.model_metadata, EngineMetadata) and self.model_metadata.adapter_mode in ('offline_rules','fake'), 'model_metadata')
        require(isinstance(self.model_metadata.parameters, dict), 'model_metadata.parameters')
        try: digest(self.model_metadata.parameters)
        except (TypeError, ValueError): raise ValidationError('INVALID_INPUT', 'model_metadata.parameters') from None
        for key in ('provider','model_id','model_version','prompt_version'):
            require(text(getattr(self.model_metadata,key)), 'model_metadata.'+key)
        for key in ('actor_id','action','input_digest','output_digest','policy_version','occurred_at'):
            require(text(self.audit_metadata.get(key)), 'audit.'+key)
        for ref in self.source_refs:
            SourceReference.parse(asdict(ref))
        require(self.audit_metadata.get('source_versions') == [ref.version for ref in self.source_refs], 'audit.source_versions')
        require(self.audit_metadata['output_digest'] == digest(self.result_payload), 'audit.output_digest')
        require(isinstance(self.warnings,tuple) and all(text(w) for w in self.warnings),'warnings')
        if self.status == 'ADVISORY':
            from .validation import validate_result
            validate_result(self.engine_id,self.result_payload,self.source_refs,self.requires_human_review)
        return True
