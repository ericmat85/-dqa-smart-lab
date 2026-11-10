from app.schemas.common import StrictModel
from app.schemas.commands import CommandEnvelope
from app.domain.workflow import WorkflowTransition
from app.core.errors import RuleNotApprovedError

__all__ = ["CommandEnvelope", "WorkflowTransition", "ErrorBody", "reject_unimplemented_mutation"]


class ErrorBody(StrictModel):
    code: str
    request_id: str


def reject_unimplemented_mutation():
    raise RuleNotApprovedError()
