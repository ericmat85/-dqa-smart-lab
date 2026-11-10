"""Pure fail-closed readiness report. Never loads a secret or enables a provider."""
from pydantic import BaseModel, ConfigDict, Field
from .model_policy import ModelPolicy

class DeploymentPlan(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)
    workers: int = Field(default=1, gt=0)
    instances: int = Field(default=1, gt=0)


def paid_readiness(policy: ModelPolicy, *, deployment=None, secret_source=None, access_verifier=None, feature="AI-01"):
    if type(policy) is not ModelPolicy or feature not in {"AI-01","AI-02","AI-03","AI-04","AI-05"}:
        raise ValueError("Invalid readiness input")
    policy = ModelPolicy.model_validate(policy.model_dump())
    deployment = deployment or DeploymentPlan()
    deployment = DeploymentPlan.model_validate(deployment.model_dump())
    blockers = ["PAID_EXECUTION_NOT_AUTHORIZED", "PRICING_UNVERIFIED", "DURABLE_SHARED_LEDGER_NOT_IMPLEMENTED",
        "RESTART_BUDGET_RECONCILIATION_NOT_IMPLEMENTED", "TRUSTED_AUTH_NOT_IMPLEMENTED"]
    if secret_source is None:
        blockers.append("SECRET_SOURCE_MISSING")
    else:
        blockers.append("SECRET_SOURCE_NOT_VERIFIED_NO_SECRET_READ")
    if access_verifier is None:
        blockers.append("ACCESS_VERIFIER_MISSING")
    if deployment.workers > 1 or deployment.instances > 1:
        blockers.append("MULTI_INSTANCE_PAID_EXECUTION_BLOCKED")
    if feature == "AI-04":
        blockers.append("IMAGE_DECODING_NOT_IMPLEMENTED")
    return {"status":"BLOCKED", "paid_enabled":False, "pricing_status":policy.pricing_status,
        "blockers":blockers, "business_commit_gate":"RULE_NOT_APPROVED"}
