"""Half-open UTC resource intervals; no lifecycle or automatic release logic."""
from fractions import Fraction
from .models import Equipment, Reservation, TimeWindow


def overlaps(left: TimeWindow, right: TimeWindow) -> bool:
    return left.start_time < right.end_time and right.start_time < left.end_time


def contains(outer: TimeWindow, inner: TimeWindow) -> bool:
    return outer.start_time <= inner.start_time and inner.end_time <= outer.end_time


def covered_by(windows: tuple[TimeWindow, ...], target: TimeWindow) -> bool:
    cursor = target.start_time
    for window in sorted(windows, key=lambda row: (row.start_time, row.end_time)):
        if window.start_time > cursor:
            return False
        if window.end_time > cursor:
            cursor = window.end_time
        if cursor >= target.end_time:
            return True
    return False


def occupied_window(reservation: Reservation, equipment: Equipment) -> TimeWindow:
    if any(value is None for value in (equipment.preparation_time, equipment.transition_time, equipment.cleanup_time)):
        raise ValueError('Missing trusted resource buffers')
    return TimeWindow(start_time=reservation.start_time-equipment.preparation_time-equipment.transition_time,
                      end_time=reservation.end_time+equipment.cleanup_time)


def peak_load(rows: tuple[tuple[Reservation, TimeWindow], ...], target: TimeWindow) -> tuple[int, Fraction, int]:
    # Clip to candidate occupancy and sweep simultaneous—not merely pairwise—load.
    events = {}
    for reservation, window in rows:
        if not overlaps(window, target):
            continue
        start, end = max(window.start_time, target.start_time), min(window.end_time, target.end_time)
        for time, sign in ((start, 1), (end, -1)):
            count, space, channels = events.get(time, (0, Fraction(0), 0))
            events[time] = (count+sign*reservation.reserved_capacity,
                space+sign*Fraction(reservation.reserved_space), channels+sign*reservation.reserved_channels)
    current = (0, Fraction(0), 0)
    peak = current
    for time in sorted(events):
        delta = events[time]
        current = tuple(a+b for a, b in zip(current, delta))
        peak = tuple(max(a, b) for a, b in zip(peak, current))
    return peak
