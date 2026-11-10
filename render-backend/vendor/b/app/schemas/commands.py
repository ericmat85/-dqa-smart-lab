from typing import Annotated, Literal, Union
from uuid import UUID
from pydantic import Field
from .common import StrictModel, PositiveVersion, NonBlank, SignatureRef
from .reports import ReportRevisionRef


class BaseCommand(StrictModel):
    expected_version: PositiveVersion
    idempotency_key: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]


class ResubmitRequest(BaseCommand):
    action: Literal["resubmit_request"]


class ApproveRequest(BaseCommand):
    action: Literal["approve_request"]
    signature: SignatureRef


class ReturnRequest(BaseCommand):
    action: Literal["return_request"]
    reason: NonBlank


class MarkElapsed(BaseCommand):
    action: Literal["mark_elapsed"]


class ConfirmComplete(BaseCommand):
    action: Literal["confirm_trial_complete"]


class ReturnReport(BaseCommand):
    action: Literal["return_report"]
    reason: NonBlank
    content_revision_id: UUID


class SubmitReport(BaseCommand):
    action: Literal["submit_report_revision"]
    revision: ReportRevisionRef
    executor_signature: SignatureRef


class ApproveReport(BaseCommand):
    action: Literal["approve_report"]
    content_revision_id: UUID
    signature: SignatureRef


class ForceInterrupt(BaseCommand):
    action: Literal["force_interrupt_trial"]
    reservation_id: UUID
    reason: NonBlank


class PendingRule(BaseCommand):
    action: Literal["early_complete", "release_equipment", "record_actual_hours", "backdate_time",
                    "reschedule_interrupted_trial", "confirm_rescheduled_receipt", "credit_hours",
                    "request_interruption", "cancel_request", "cancel_arrangement", "pause_trial", "resume_trial"]


Command = Annotated[Union[ResubmitRequest, ApproveRequest, ReturnRequest, MarkElapsed,
    ConfirmComplete, ReturnReport, SubmitReport, ApproveReport, ForceInterrupt, PendingRule], Field(discriminator="action")]


class CommandEnvelope(StrictModel):
    command: Command
