from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from typing import Literal

router = APIRouter()


class Liveness(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["alive"] = "alive"
    mode: Literal["offline"] = "offline"
    integrations: Literal["NOT_CONFIGURED"] = "NOT_CONFIGURED"


@router.get("/health/live",response_model=Liveness)
def live() -> Liveness:
    return Liveness()
