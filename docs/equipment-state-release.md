# Release an unallocated equipment usage label

Imported equipment can have operational_status=IN_USE without any schedule allocation or borrowing record. Previously execute_resource_operation rejected this label unconditionally, leaving equipment managers unable to restore IDLE.

Migration 024 allows an equipment manager to change IN_USE to IDLE only after the existing transaction locks, revision check and tenant authorization succeed. Any unreleased schedule_equipment allocation or borrow in PENDING, REQUESTED (legacy), APPROVED or ON_LOAN still prevents the change. No timing heuristic releases reservations. ON_LOAN, PAUSED and RETIRED equipment labels remain protected. IN_USE cannot jump directly to maintenance or calibration.

The existing status dialog defaults connected IN_USE equipment to 待機中 and offers only that target. It requires a reason. The server remains authoritative for occupancy; it records the before/after state, actor, reason and time in the append-only resource event and audit trail. Clearing usage does not create maintenance or calibration completion dates. No existing equipment or workflow row is changed by the migration itself.

Local verification uses synthetic PostgreSQL fixtures inside the existing network-disabled container, with all test mutations rolled back, plus desktop/mobile tests of the real dialog with mocked transport. The borrowed-state fixtures disable only the local borrowing workflow gate while seeding and restore it before testing the authenticated command; production gates are unchanged.

Deployment requires migration 024 through the checked migration bundle and the matching frontend on the same PR47. Do not manually reset production equipment, release an allocation, or delete a borrow to work around this bug.
