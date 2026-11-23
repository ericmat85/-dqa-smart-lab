"""Pure rejection rules. No equipment-sharing exception or supervisor override."""
from .models import Conditions, Equipment, Engineer, TimeWindow

REQUIRED_EVIDENCE = frozenset({'equipment', 'engineers', 'samples', 'requirements',
    'reservations', 'maintenance', 'qualifications', 'availability', 'assigned_work'})
UNAPPROVED_INTENTS = frozenset({'early_complete', 'release_equipment', 'reschedule_interrupted_trial',
    'confirm_rescheduled_receipt', 'record_actual_hours', 'backdate_time', 'credit_hours',
    'pause_trial', 'resume_trial', 'request_interruption', 'cancel_request',
    'cancel_arrangement', 'cancel_other_case_schedule', 'share_equipment', 'supervisor_override'})


def complete_conditions(conditions: Conditions) -> bool:
    return (conditions.temperature is not None and conditions.humidity is not None
            and conditions.temperature.unit == 'degC' and conditions.humidity.unit == '%RH')


def equipment_supports(equipment: Equipment, conditions: Conditions) -> bool:
    for supported, requested, unit in ((equipment.supported_temperature, conditions.temperature, 'degC'),
                                        (equipment.supported_humidity, conditions.humidity, '%RH')):
        if (supported is None or requested is None or supported.unit != unit or requested.unit != unit
                or requested.minimum < supported.minimum or requested.maximum > supported.maximum):
            return False
    return True


def engineer_qualified(engineer: Engineer, test_type: str, window: TimeWindow) -> bool:
    return any(q.test_type == test_type and q.valid_from <= window.start_time
               and q.valid_until >= window.end_time and bool(q.evidence_reference)
               for q in engineer.qualifications)
