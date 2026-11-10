"""Deterministic offline evaluator. Its result can never commit a business operation."""
from datetime import datetime
from fractions import Fraction
from pydantic import ValidationError
from app.core.errors import RuleNotApprovedError
from .models import CandidateSchedule, TrustedSnapshot, Clock, utc
from .decisions import SchedulingDecision
from .constraints import REQUIRED_EVIDENCE, complete_conditions, equipment_supports, engineer_qualified
from .conflicts import overlaps, contains, covered_by, occupied_window, peak_load

PRIORITY = ('RULE_NOT_APPROVED', 'STALE_SNAPSHOT', 'MISSING_REQUIRED_DATA',
            'EQUIPMENT_UNAVAILABLE', 'CAPACITY_EXCEEDED', 'ENVIRONMENT_INCOMPATIBLE',
            'TIME_CONFLICT', 'ENGINEER_UNQUALIFIED')


def evaluate_candidate(candidate: CandidateSchedule, trusted_snapshot: TrustedSnapshot, *,
                       evaluated_at: datetime) -> SchedulingDecision:
    now = utc(evaluated_at)  # explicit trusted input; naive times never silently interpreted
    issues, evidence = set(), set()
    version, references = None, ()

    def reject(code, required=None):
        issues.add(code)
        if required:
            evidence.add(required)

    def result():
        codes = tuple(code for code in PRIORITY if code in issues)
        return SchedulingDecision(allowed=not codes,
            decision_code=codes[0] if codes else 'ALLOW_CANDIDATE_ONLY', conflict_codes=codes,
            evaluated_snapshot_version=version, evaluated_at=now,
            required_evidence=tuple(sorted(evidence)),
            proposed_reservation_reference=references[0] if references else None,
            proposed_reservation_references=references)

    # Revalidate even constructed/copied Python models; no trusted flags from AI dictionaries.
    if not isinstance(candidate, CandidateSchedule) or not isinstance(trusted_snapshot, TrustedSnapshot):
        reject('MISSING_REQUIRED_DATA', 'VALIDATED_CANDIDATE_AND_TRUSTED_SNAPSHOT')
        return result()
    try:
        candidate = CandidateSchedule.model_validate(candidate.model_dump())
        snapshot = TrustedSnapshot.model_validate(trusted_snapshot.model_dump())
    except (ValidationError, ValueError, TypeError, OverflowError):
        reject('MISSING_REQUIRED_DATA', 'VALIDATED_CANDIDATE_AND_TRUSTED_SNAPSHOT')
        return result()
    version = snapshot.version
    proposed = candidate.proposed_reservations
    references = tuple(r.reservation_id for r in proposed)
    if candidate.intent != 'new_reservation' or any(r.status != 'proposed' for r in proposed):
        reject('RULE_NOT_APPROVED', 'APPROVED_BUSINESS_POLICY')
        return result()
    if candidate.expected_version != version or not snapshot.as_of <= now < snapshot.valid_until:
        reject('STALE_SNAPSHOT', 'FRESH_TRUSTED_VERSION')
        return result()
    missing = REQUIRED_EVIDENCE - snapshot.complete_evidence
    if missing:
        reject('MISSING_REQUIRED_DATA')
        evidence.update('COMPLETE_'+key.upper() for key in missing)
        return result()
    if (len(set(references)) != len(references) or len({r.equipment_id for r in proposed}) != len(proposed)
            or any(r.tenant_id != snapshot.tenant_id for r in proposed)
            or len({(r.request_id, r.test_item_id, r.start_time, r.end_time) for r in proposed}) != 1):
        reject('MISSING_REQUIRED_DATA', 'CONSISTENT_TENANT_BOUND_BUNDLE')
        return result()
    if set(references) & {r.reservation_id for r in snapshot.reservations}:
        reject('RULE_NOT_APPROVED', 'NEW_RESERVATION_NOT_AN_EDIT')
        return result()
    first = proposed[0]
    requirement = next((r for r in snapshot.requirements
                       if (r.request_id, r.test_item_id) == (first.request_id, first.test_item_id)), None)
    if requirement is None:
        reject('MISSING_REQUIRED_DATA', 'TRUSTED_TEST_REQUIREMENT')
        return result()
    if requirement.scheduling_state != 'new_unassigned' or any(
            (r.request_id, r.test_item_id) == (first.request_id, first.test_item_id)
            for r in snapshot.reservations):
        reject('RULE_NOT_APPROVED', 'APPROVED_EXISTING_TRIAL_SCHEDULING_POLICY')
        return result()
    if requirement.equipment_count != len(proposed):
        reject('MISSING_REQUIRED_DATA', 'EXACT_EQUIPMENT_COUNT')
    all_sample_ids = [sid for row in proposed for sid in row.sample_ids]
    if (not requirement.sample_ids or len(set(all_sample_ids)) != len(all_sample_ids)
            or set(all_sample_ids) != requirement.sample_ids):
        reject('MISSING_REQUIRED_DATA', 'EXACT_SAMPLE_ALLOCATION')
    machines = {m.equipment_id: m for m in snapshot.equipment}
    engineers = {e.engineer_id: e for e in snapshot.engineers}
    samples = {s.sample_id: s for s in snapshot.samples}
    windows = []
    for row in proposed:
        machine, engineer = machines.get(row.equipment_id), engineers.get(row.engineer_id)
        if machine is None:
            reject('EQUIPMENT_UNAVAILABLE', 'TRUSTED_EQUIPMENT')
            continue
        if machine.status != 'ready':
            reject('EQUIPMENT_UNAVAILABLE', 'READY_EQUIPMENT')
        if engineer is None:
            reject('ENGINEER_UNQUALIFIED', 'TRUSTED_ENGINEER')
        allocated = [samples.get(sid) for sid in row.sample_ids]
        if not allocated or any(sample is None for sample in allocated):
            reject('MISSING_REQUIRED_DATA', 'TRUSTED_SAMPLES')
        else:
            count, space, channels = len(allocated), sum((Fraction(s.required_space) for s in allocated), Fraction(0)), sum(s.required_channels for s in allocated)
            if (row.reserved_capacity, row.reserved_space, row.reserved_channels) != (count, space, channels):
                reject('MISSING_REQUIRED_DATA', 'EXACT_TRUSTED_SAMPLE_DEMAND')
            # Check recomputed demand too: an understated AI reservation cannot pass.
            if (count > machine.capacity or space > machine.available_space or channels > machine.channels):
                reject('CAPACITY_EXCEEDED')
            for sample in allocated:
                if not complete_conditions(sample.requested_conditions):
                    reject('MISSING_REQUIRED_DATA', 'COMPLETE_SAMPLE_CONDITIONS')
                elif sample.requested_conditions != row.conditions:
                    reject('ENVIRONMENT_INCOMPATIBLE')
        if not complete_conditions(row.conditions) or not complete_conditions(requirement.conditions):
            reject('MISSING_REQUIRED_DATA', 'COMPLETE_TEST_CONDITIONS')
        elif row.conditions != requirement.conditions:
            reject('ENVIRONMENT_INCOMPATIBLE')
        if machine.supported_temperature is None or machine.supported_humidity is None:
            reject('MISSING_REQUIRED_DATA', 'TRUSTED_EQUIPMENT_CONDITIONS')
        elif not equipment_supports(machine, row.conditions):
            reject('ENVIRONMENT_INCOMPATIBLE')
        try:
            window = occupied_window(row, machine)
        except (ValueError, OverflowError):
            reject('MISSING_REQUIRED_DATA', 'TRUSTED_RESOURCE_BUFFERS')
            continue
        if window.start_time < now:
            reject('RULE_NOT_APPROVED', 'NO_BACKDATED_NEW_RESERVATION')
        if not contains(snapshot.horizon, window):
            reject('MISSING_REQUIRED_DATA', 'COMPLETE_SNAPSHOT_HORIZON')
        if not covered_by(machine.availability, window):
            reject('EQUIPMENT_UNAVAILABLE', 'EQUIPMENT_AVAILABILITY')
        for maintenance in snapshot.maintenance:
            if maintenance.equipment_id == row.equipment_id and overlaps(maintenance, window):
                reject('EQUIPMENT_UNAVAILABLE', 'NO_MAINTENANCE_OR_CALIBRATION_CONFLICT')
        if engineer is not None:
            if not engineer_qualified(engineer, requirement.test_type, window):
                reject('ENGINEER_UNQUALIFIED', 'VALID_QUALIFICATION_FOR_FULL_WINDOW')
            if not covered_by(engineer.availability, window):
                reject('TIME_CONFLICT', 'ENGINEER_AVAILABILITY')
            if any(overlaps(work, window) for work in engineer.assigned_work):
                reject('TIME_CONFLICT', 'ENGINEER_UNOCCUPIED')
        windows.append((row, window))

    for row, window in windows:
        load_rows = [(row, window)]
        for other in snapshot.reservations:
            same_machine, same_engineer = other.equipment_id == row.equipment_id, other.engineer_id == row.engineer_id
            if not same_machine and not same_engineer:
                continue
            # Completion/cancellation/pause is NOT proof of safe equipment release.
            if other.status != 'planned':
                reject('RULE_NOT_APPROVED', 'RESOLVED_RESOURCE_HOLD_AND_RELEASE_POLICY')
                continue
            other_machine = machines.get(other.equipment_id)
            if other_machine is None:
                reject('MISSING_REQUIRED_DATA', 'TRUSTED_EXISTING_RESOURCE')
                continue
            try:
                other_window = occupied_window(other, other_machine)
            except (ValueError, OverflowError):
                reject('MISSING_REQUIRED_DATA', 'TRUSTED_EXISTING_RESOURCE_BUFFERS')
                continue
            if overlaps(window, other_window):
                reject('TIME_CONFLICT')
                if same_machine:
                    load_rows.append((other, other_window))
                    if not complete_conditions(other.conditions):
                        reject('MISSING_REQUIRED_DATA', 'COMPLETE_EXISTING_CONDITIONS')
                    elif row.conditions != other.conditions:
                        reject('ENVIRONMENT_INCOMPATIBLE')
        for other, other_window in windows:
            if other.reservation_id != row.reservation_id and overlaps(window, other_window):
                if other.equipment_id == row.equipment_id or other.engineer_id == row.engineer_id:
                    reject('TIME_CONFLICT')
                if other.equipment_id == row.equipment_id:
                    load_rows.append((other, other_window))
        count, space, channels = peak_load(tuple(load_rows), window)
        machine = machines[row.equipment_id]
        if count > machine.capacity or space > machine.available_space or channels > machine.channels:
            reject('CAPACITY_EXCEEDED')
    return result()


class SchedulingEvaluator:
    def __init__(self, clock: Clock):
        self.clock = clock

    def evaluate_candidate(self, candidate: CandidateSchedule, trusted_snapshot: TrustedSnapshot) -> SchedulingDecision:
        return evaluate_candidate(candidate, trusted_snapshot, evaluated_at=self.clock.now())


def require_schedulable_commit(decision: SchedulingDecision):
    # No outcome, including allow, enables booking, release or any external side effect.
    raise RuleNotApprovedError()
