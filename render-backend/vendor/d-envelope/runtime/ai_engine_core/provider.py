"""Internal protocol only. No HTTP transport, credentials or budget ledger."""
from typing import Protocol
from .models import EngineMetadata

class ProviderUnavailable(Exception):
    pass

class ProviderProtocol(Protocol):
    # D-01 runner accepts only injected fakes; B binding requires new authorization.
    mode: str
    metadata: EngineMetadata

    def suggest(self, engine_id: str, rule_result: dict) -> str:
        """Return optional advisory text only. TimeoutError signals fake timeout.
        Cannot return authoritative fields, approval, measurements or citations.
        """
        ...
