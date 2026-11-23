"""Explicit offline configuration. No environment or credential loading."""
from urllib.parse import urlsplit
from pydantic import BaseModel,ConfigDict,field_validator


class CompetitionSettings(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
    allowed_origins: tuple[str,...]=()

    @field_validator('allowed_origins')
    @classmethod
    def exact_origins(cls,values):
        if len(set(values))!=len(values):raise ValueError('Duplicate origins')
        for origin in values:
            parsed=urlsplit(origin)
            if (origin.strip()!=origin or '*' in origin or parsed.scheme not in ('https','http')
                    or not parsed.hostname or parsed.username or parsed.password
                    or parsed.path or parsed.query or parsed.fragment
                    or origin!=parsed.scheme+'://'+parsed.netloc
                    or (parsed.scheme=='http' and parsed.hostname not in ('localhost','127.0.0.1','[::1]','::1'))):
                raise ValueError('Exact HTTPS or loopback origin required')
            try:parsed.port
            except ValueError:raise ValueError('Invalid origin port') from None
        return values


class OpenAIAdapterSettings(BaseModel):
    """Server-side offline simulation settings, never loaded from request/env."""
    model_config=ConfigDict(strict=True,extra='forbid',frozen=True)
    enabled: bool=False
    model_id: str | None=None
    timeout_ms: int=1000
    max_input_tokens: int=32000
    max_output_tokens: int=1000
    input_framing_margin: int=1000
    max_retries: int=0
    paid_network_enabled: bool=False
    workers: int=1
    instances: int=1

    @field_validator('model_id')
    @classmethod
    def controlled_model(cls,value):
        import re
        if value is not None and not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}',value):raise ValueError('Invalid model identifier')
        return value

    @field_validator('timeout_ms','max_input_tokens','max_output_tokens','input_framing_margin')
    @classmethod
    def bounded(cls,value,info):
        caps={'timeout_ms':30000,'max_input_tokens':100000,'max_output_tokens':10000,'input_framing_margin':10000}
        if type(value) is not int or not 1<=value<=caps[info.field_name]:raise ValueError('Invalid limit')
        return value

    @field_validator('max_retries','workers','instances')
    @classmethod
    def offline_topology(cls,value,info):
        expected=0 if info.field_name=='max_retries' else 1
        if type(value) is not int or value!=expected:raise ValueError('Unsupported retry or deployment topology')
        return value

    @field_validator('paid_network_enabled')
    @classmethod
    def no_paid_network(cls,value):
        if value is not False:raise ValueError('Paid network requires separate authorization and persistent controls')
        return value
