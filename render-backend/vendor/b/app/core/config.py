from typing import Literal
from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)
    mode: Literal["offline"] = "offline"
    # No environment loading, credentials, network providers, or real adapters.
