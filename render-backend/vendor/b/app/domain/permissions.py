from enum import Enum


class Role(str, Enum):
    REQUESTER = "requester"
    REQUEST_MANAGER = "request_manager"
    ENGINEER = "engineer"
    ASSISTANT = "assistant"
    LEVEL1 = "level1"
    LEVEL2 = "level2"
    LEVEL3 = "level3"
    ADMIN = "admin"


class Permission(str, Enum):
    # Logical port vocabulary, NOT a production DB permission mapping or seed.
    RESUBMIT = "resubmit_request"
    REVIEW_REQUEST = "review_request"
    COMPLETE = "confirm_trial_complete"
    REPORT_RETURN = "return_report"
    REPORT_SUBMIT = "submit_report_revision"
    REPORT_REVIEW = "review_report"
    FORCE_INTERRUPT = "force_interrupt_trial"
    EDIT_SCHEDULE = "edit_schedule"
    # Offline artifact port vocabulary only; no production grants or seed mapping.
    ARTIFACT_READ = "artifact_read"
    ARTIFACT_WRITE = "artifact_write"
