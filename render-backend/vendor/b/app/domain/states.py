from enum import Enum, IntEnum


class Stage(IntEnum):
    SIGNOFF = 1
    REVIEW = 2
    SCHEDULING = 3
    CONFIRMATION = 4
    RUNNING = 5
    REPORT_PROCESSING = 6
    REPORT_REVIEW = 7
    REPORT_VIEW = 8
    CLOSED = 9


class Substate(str, Enum):
    DRAFT = "draft"
    RETURNED = "returned"
    PENDING_SIGNOFF = "pending_signoff"
    REQUEST_LEVEL1 = "request_level1"
    REQUEST_LEVEL2 = "request_level2"
    UNSCHEDULED = "unscheduled"
    AWAITING_RECEIPT = "awaiting_receipt"
    RECEIVED_WAITING_START = "received_waiting_start"
    RUNNING = "running"
    AWAITING_COMPLETION = "awaiting_completion"
    INTERRUPTED = "interrupted"
    PAUSED = "paused"
    PENDING_REPORT = "pending_report"
    REPORT_LEVEL2 = "report_level2"
    REPORT_LEVEL3 = "report_level3"
    REPORT_VIEW = "report_view"
    ARCHIVED = "archived"


def stage_four_display(received: bool) -> tuple[str, str, str]:
    return ("已排程", "已確認" if received else "待確認", "待開始")
