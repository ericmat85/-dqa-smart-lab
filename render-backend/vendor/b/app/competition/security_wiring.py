"""COMP-03B-2C shared advisory boundary. No live enablement exists here.

Ports accept server-derived evidence only. Synthetic evidence permits only an
exact MockTransport simulation, never real Render/Auth/pricing approval.
"""
from dataclasses import dataclass
from threading import RLock
from typing import Protocol, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .provider_models import AIFeature, OPERATION_FEATURE
from .ai_adapter import OpenAIProviderAdapter, ProviderNotImplemented
from .config import OpenAIAdapterSettings
from .prepared_transport import PreparedProviderTransport
from .provider_usage import ModelPrice, MemoryUsageLog
from .signed_access import SignedCredentialVerifier, VerifiedAIIdentity
from .readiness import paid_readiness, DeploymentPlan
from .model_policy import ModelPolicy


class RenderConfiguration(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid', frozen=True)
    python_version: Literal['3.12'] = '3.12'
    disk_mount: Literal['/var/data'] = '/var/data'
    budget_directory: Literal['/var/data/competition-budget'] = '/var/data/competition-budget'
    workers: Literal[1] = 1
    instances: Literal[1] = 1
    paid_network_enabled: Literal[False] = False

    @field_validator('workers','instances',mode='before')
    @classmethod
    def singleton(cls,value):
        if type(value) is not int or value != 1:raise ValueError('Singleton required')
        return value

    @field_validator('paid_network_enabled',mode='before')
    @classmethod
    def no_paid_network(cls,value):
        if value is not False:raise ValueError('Paid network is not authorized')
        return value

    @classmethod
    def checked(cls, value):
        if type(value) is not cls:
            raise ValueError('Invalid backend configuration')
        # Pydantic Literal integers can accept bool: explicit checks precede dump.
        if type(value.workers) is not int or type(value.instances) is not int or value.paid_network_enabled is not False:
            raise ValueError('Invalid deployment topology')
        return cls.model_validate(value.model_dump())


class SecurityDenied(Exception):
    _CODES = {
        'AUTH_UNAVAILABLE':503, 'AUTH_DENIED':401, 'PERMISSION_DENIED':403,
        'FEATURE_DISABLED':503, 'PRICE_UNVERIFIED':503, 'BUDGET_UNAVAILABLE':503,
        'PERSISTENCE_UNVERIFIED':503, 'SNAPSHOT_RECOVERY_BLOCKED':503,
        'SECRET_UNAVAILABLE':503, 'TRANSPORT_DISABLED':503,
    }
    def __init__(self, code):
        self.code = code if code in self._CODES else 'FEATURE_DISABLED'
        self.http_status = self._CODES[self.code]
        super().__init__(self.code)


@dataclass(frozen=True)
class FeatureGrant:
    subject: str
    credential_id: str
    epoch: int
    feature: AIFeature
    role_evidence_id: str
    permission_evidence_id: str


@dataclass(frozen=True)
class OfflineDiskProof:
    runtime_id: UUID
    ledger_id: UUID
    checkpoint_sha256: str
    restored_from_snapshot: bool = False
    restart_reconciled: bool = False
    scope: Literal['OFFLINE_SIMULATION_ONLY'] = 'OFFLINE_SIMULATION_ONLY'


@dataclass(frozen=True)
class OfflinePricePermit:
    price: ModelPrice
    max_input_tokens: int
    max_output_tokens: int
    framing_margin: int = 1000

    def validate(self):
        if type(self.price) is not ModelPrice or not self.price.pricing_reference.startswith('SYNTHETIC_TEST_'):
            raise SecurityDenied('PRICE_UNVERIFIED')
        for n,cap in ((self.max_input_tokens,100000),(self.max_output_tokens,10000),(self.framing_margin,10000)):
            if type(n) is not int or not 1<=n<=cap:
                raise SecurityDenied('PRICE_UNVERIFIED')
        self.price.cost(self.max_input_tokens, self.max_output_tokens)
        return self


class FeaturePermissionPort(Protocol):
    def grant(self, actor: VerifiedAIIdentity, feature: AIFeature) -> FeatureGrant: ...


class PricingPort(Protocol):
    def resolve(self, feature: AIFeature) -> OfflinePricePermit: ...


class DiskEvidencePort(Protocol):
    def inspect(self, config: RenderConfiguration, runtime_id: UUID, ledger_id: UUID) -> OfflineDiskProof: ...


class SecurityWiring:
    """Only explicit synthetic DI can exercise gates. Default is unavailable.

    Each invocation revalidates identity/permission/price/disk/ledger. Adapter
    performs the atomic reservation before sending and conservative settlement.
    No business-state writer is present. No role mapping is invented here.
    """
    mode = 'FAKE_OFFLINE'

    def __init__(self, *, config=None, verifier=None, permissions=None, enabled_features=(),
                 pricing=None, disk_evidence=None, ledger=None, ledger_id=None,
                 secret_source=None, transport=None):
        self.config = RenderConfiguration.checked(config or RenderConfiguration())
        self.verifier=verifier; self.permissions=permissions
        if any(type(f) is not AIFeature for f in enabled_features):raise ValueError('Invalid feature')
        self.enabled_features=frozenset(enabled_features)
        self.pricing=pricing; self.disk_evidence=disk_evidence; self.ledger=ledger
        if ledger_id is not None and type(ledger_id) is not UUID:raise ValueError('Invalid ledger identity')
        self.ledger_id=ledger_id;self.secret_source=secret_source;self.transport=transport
        self.runtime_id=uuid4();self.usage_audit=MemoryUsageLog()
        self._audit=[];self._lock=RLock()

    def live_readiness(self, feature='AI-01'):
        """Reuse B1's conservative report; offline DI never clears live blockers."""
        config=RenderConfiguration.checked(self.config)
        return paid_readiness(ModelPolicy(),deployment=DeploymentPlan(workers=config.workers,instances=config.instances),
            secret_source=self.secret_source,access_verifier=self.verifier,feature=feature)

    @property
    def audit(self):
        with self._lock:return tuple(dict(event) for event in self._audit)

    def _record(self, feature, status):
        # Fixed server metadata only: no token, claim dump, prompt or key.
        with self._lock:self._audit.append({'feature':feature.value,'status':status,'business_commit_gate':'RULE_NOT_APPROVED'})

    async def execute(self, operation, payload, request):
        feature=OPERATION_FEATURE.get(operation)
        if type(feature) is not AIFeature:raise SecurityDenied('FEATURE_DISABLED')
        try:
            # Availability refusal preserves the existing default 503 contract.
            # A configured pipeline then follows schema -> auth -> permission ...
            if self.verifier is None:raise SecurityDenied('AUTH_UNAVAILABLE')
            if type(self.verifier) is not SignedCredentialVerifier:raise SecurityDenied('AUTH_UNAVAILABLE')
            try:
                headers=request.headers.getlist('authorization')
                if len(headers)!=1 or not headers[0].startswith('Bearer '):raise ValueError()
                actor=self.verifier.verify(headers[0][7:], feature)
            except Exception:raise SecurityDenied('AUTH_DENIED') from None
            if type(actor) is not VerifiedAIIdentity:raise SecurityDenied('AUTH_DENIED')
            try:
                grant=self.permissions.grant(actor,feature)
                if type(grant) is not FeatureGrant or type(grant.epoch) is not int or type(grant.feature) is not AIFeature or (grant.subject,grant.credential_id,grant.epoch,grant.feature)!=(actor.subject,actor.credential_id,actor.epoch,feature):raise ValueError()
                if not all(type(v) is str and 0<len(v)<=100 for v in (grant.role_evidence_id,grant.permission_evidence_id)):raise ValueError()
            except Exception:raise SecurityDenied('PERMISSION_DENIED') from None
            if feature not in self.enabled_features:raise SecurityDenied('FEATURE_DISABLED')
            try:
                permit=self.pricing.resolve(feature)
                if type(permit) is not OfflinePricePermit:raise ValueError()
                permit=permit.validate()
            except Exception:raise SecurityDenied('PRICE_UNVERIFIED') from None
            try:
                config=RenderConfiguration.checked(self.config)
                proof=self.disk_evidence.inspect(config,self.runtime_id,self.ledger_id)
                if type(proof) is not OfflineDiskProof or proof.scope!='OFFLINE_SIMULATION_ONLY' or self.ledger_id is None:
                    raise ValueError()
                if proof.runtime_id!=self.runtime_id or proof.ledger_id!=self.ledger_id or type(proof.restart_reconciled) is not bool or proof.restart_reconciled is not True:
                    raise ValueError()
                if type(proof.restored_from_snapshot) is not bool:raise ValueError()
                if proof.restored_from_snapshot:raise SecurityDenied('SNAPSHOT_RECOVERY_BLOCKED')
                if type(proof.checkpoint_sha256) is not str or len(proof.checkpoint_sha256)!=64 or any(c not in '0123456789abcdef' for c in proof.checkpoint_sha256):raise ValueError()
            except SecurityDenied:raise
            except Exception:raise SecurityDenied('PERSISTENCE_UNVERIFIED') from None
            try:
                state=self.ledger.snapshot()
                if state.get('ledger_id') != str(self.ledger_id):raise ValueError()
                # Money fields must be exact, coherent, and within authorized cap.
                fields=[state.get(k) for k in ('cap_micro_usd','accounted_micro_usd','held_micro_usd','available_micro_usd')]
                if any(type(n) is not int or n<0 for n in fields) or not 0<fields[0]<=10000000 or fields[0]!=sum(fields[1:]):raise ValueError()
            except Exception:raise SecurityDenied('BUDGET_UNAVAILABLE') from None
            if self.secret_source is None:raise SecurityDenied('SECRET_UNAVAILABLE')
            if type(self.transport) is not PreparedProviderTransport or self.transport.offline_ready is not True:
                raise SecurityDenied('TRANSPORT_DISABLED')
            # The shared adapter validates schema/output/usage and reserves atomically.
            # Its mode and this service's outputs remain explicitly FAKE_OFFLINE.
            settings=OpenAIAdapterSettings(enabled=True,model_id=permit.price.model,
                max_input_tokens=permit.max_input_tokens,max_output_tokens=permit.max_output_tokens,
                input_framing_margin=permit.framing_margin)
            adapter=OpenAIProviderAdapter(settings,secret_source=self.secret_source,
                transport=self.transport,ledger=self.ledger,prices={permit.price.model:permit.price},audit=self.usage_audit)
            result=await adapter.suggest(operation,payload)
            self._record(feature,'OFFLINE_SIMULATED_SUCCESS')
            return result
        except BaseException as error:
            self._record(feature, error.code if type(error) is SecurityDenied else 'ADVICE_NOT_COMPLETED')
            raise


class DisabledAdviceService:
    async def execute(self, operation, payload, request):
        raise ProviderNotImplemented()


class ExplicitOfflineCompatibilityService:
    """Legacy test-injection seam. Never selected without explicit provider DI.

    It only accepts the pre-existing FAKE_OFFLINE response path; no real adapter
    mode is supported. Does not claim authentication, pricing or disk validation.
    """
    def __init__(self, provider):self._provider=provider
    async def execute(self, operation, payload, request):
        if self._provider.mode!='FAKE_OFFLINE':raise ProviderNotImplemented()
        return await self._provider.suggest(operation,payload.model_copy(deep=True))
