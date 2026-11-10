"""TEST ONLY: lock-protected memory contract double. Never imported by app.

No DB, Auth, bytes storage or AI provider. Explicit synthetic publication is
separate from the always-denied UnitOfWork.commit business entry point.
"""
from copy import deepcopy
from hashlib import sha256
from threading import RLock
from uuid import uuid4
from app.authz.adapters.context import AuthorizationSnapshot
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.core.errors import AuthorizationError, IdempotencyConflictError, VersionConflictError, InvalidTransitionError
from app.domain.workflow import transition, IdempotencyRecord, require_committable_business_operation
from app.ports.transaction_contract import AuditRecord, idempotency_scope


class MemoryStore:
    def __init__(self, cases):
        self.lock = RLock()
        self.data = {'cases': {(c.tenant_id, c.request_id): c for c in cases},
                     'events': {}, 'audits': {}, 'reviews': {}, 'revisions': {},
                     'idempotency': {}, 'references': set()}
        self.members = {}
        for c in cases:
            self.data['reviews'][(c.tenant_id, c.request_id)] = c.reviews
            for e in c.events:
                if e.event_id in self.data['events']:
                    raise InvalidTransitionError()
                self.data['events'][e.event_id] = e
            for r in c.reports:
                self.data['revisions'][(c.tenant_id, c.request_id, r.content_revision_id)] = r

    def snapshot(self):
        with self.lock:
            return deepcopy(self.data)

    def validate(self, actor_id, tenant_id, membership_version, case_id, case_version):
        with self.lock:
            row = self.data['cases'].get((tenant_id, case_id))
            return (self.members.get((tenant_id, actor_id)) == membership_version
                    and row is not None and str(row.version) == case_version)

    def revoke(self, actor):
        with self.lock:
            self.members.pop((actor.tenant_id, actor.actor_id), None)


class MemoryRepository:
    def __init__(self, uow):
        self.uow = uow

    def get_case(self, tenant_id, request_id):
        self.uow.scope(tenant_id, request_id)
        return self.uow.local['cases'].get((tenant_id, request_id))

    def compare_and_swap(self, state, expected_version):
        self.uow.scope(state.tenant_id, state.request_id)
        old = self.get_case(state.tenant_id, state.request_id)
        if (type(expected_version) is not int or old is None or old.version != expected_version
                or state.version != expected_version + 1):
            raise VersionConflictError()
        self.uow.local['cases'][(state.tenant_id, state.request_id)] = state

    def append_event(self, event):
        self.uow.scope(event.tenant_id, event.request_id, event.actor_id)
        if event.event_id in self.uow.local['events']:
            raise InvalidTransitionError()
        self.uow.local['events'][event.event_id] = event

    def get_idempotency(self, tenant_id, actor_id, request_id, key, *, action):
        self.uow.scope(tenant_id, request_id, actor_id)
        return self.uow.local['idempotency'].get((tenant_id, actor_id, request_id, action, key))

    def save_idempotency(self, record):
        self.uow.scope(record.tenant_id, record.request_id, record.actor_id)
        key = idempotency_scope(record)
        if key in self.uow.local['idempotency']:
            raise IdempotencyConflictError()
        self.uow.local['idempotency'][key] = record

    def append_audit(self, record):
        event = record.event
        self.uow.scope(event.tenant_id, event.request_id, event.actor_id)
        if record.audit_id in self.uow.local['audits']:
            raise InvalidTransitionError()
        self.uow.local['audits'][record.audit_id] = record


class ReferenceOnlyArtifacts:
    def __init__(self, uow):
        self.uow = uow

    def put_new_bytes(self, reference, content):
        # P5-03 is not implemented by pretending metadata is immutable bytes.
        require_committable_business_operation(None)

    def get_bytes(self, reference):
        require_committable_business_operation(None)

    def append_revision(self, tenant_id, request_id, revision):
        self.uow.scope(tenant_id, request_id)
        key = (tenant_id, request_id, revision.content_revision_id)
        if key in self.uow.local['revisions']:
            raise InvalidTransitionError()
        self.uow.local['revisions'][key] = revision


def references(case):
    refs = set()
    for r in case.reports:
        refs.add(r.original)
        refs.update(r.signed_artifacts)
        refs.update(r.signatures)
    refs.update(r.signature for r in case.reviews if r.signature is not None)
    return {(r.artifact_id, r.sha256) for r in refs}


class MemoryUnitOfWork:
    def __init__(self, store, snapshot, clock, *, review_level=None):
        if not isinstance(snapshot, AuthorizationSnapshot):
            raise AuthorizationError()
        self.store, self.snapshot, self.clock = store, snapshot, clock
        self.evaluator = SnapshotPermissionEvaluator(snapshot, store, clock,
            mode='TEST_ONLY', review_level=review_level)
        self.repository, self.artifacts = MemoryRepository(self), ReferenceOnlyArtifacts(self)
        self.active = False
        self.started = False
        self.prepared = None

    def __enter__(self):
        if self.started:
            raise InvalidTransitionError()
        self.started = True
        self.local = self.store.snapshot()
        self.original = deepcopy(self.local)
        self.active = True
        return self

    def scope(self, tenant_id, request_id, actor_id=None):
        s = self.snapshot
        if (not self.active or tenant_id != s.actor.tenant_id
                or tenant_id != s.case.scope.tenant_id
                or request_id != s.case.scope.request_id
                or (actor_id is not None and actor_id != s.actor.actor_id)):
            raise AuthorizationError()

    def prepare(self, command, *, event_id, now, fail_after=None):
        if self.prepared is not None:
            raise InvalidTransitionError()
        try:
            s = self.snapshot
            c = self.repository.get_case(s.actor.tenant_id, s.case.scope.request_id)
            if c is None:
                raise AuthorizationError()
            prior = self.repository.get_idempotency(c.tenant_id, s.actor.actor_id, c.request_id,
                command.idempotency_key, action=command.action)
            result = transition(c, command, s.actor, self.evaluator,
                                event_id=event_id, now=now, prior=prior)
            self.prepared = (command, result, prior is not None, event_id, now)
            if prior is not None:
                return result
            operations = [lambda: self.repository.compare_and_swap(result.state, command.expected_version),
                          lambda: self.repository.append_event(result.event),
                          lambda: self._reviews(result),
                          lambda: self.repository.append_audit(AuditRecord(audit_id=uuid4(), event=result.event)),
                          lambda: self._revisions(c, result),
                          lambda: self.repository.save_idempotency(IdempotencyRecord(tenant_id=c.tenant_id,
                              actor_id=s.actor.actor_id, request_id=c.request_id, key=command.idempotency_key,
                              payload_sha256=sha256(command.model_dump_json().encode()).hexdigest(), result=result))]
            for i, operation in enumerate(operations):
                operation()
                if fail_after == i:
                    raise RuntimeError('SYNTHETIC_INJECTED_FAILURE')
            return result
        except BaseException:
            self.rollback()
            raise

    def _reviews(self, result):
        c = result.state
        self.local['reviews'][(c.tenant_id, c.request_id)] = c.reviews

    def _revisions(self, old, result):
        for revision in result.state.reports[len(old.reports):]:
            self.artifacts.append_revision(old.tenant_id, old.request_id, revision)

    def publish_synthetic_for_test(self):
        """Only test harness may publish; not UnitOfWork.commit or an API."""
        try:
            if not self.active or self.prepared is None:
                raise InvalidTransitionError()
            cmd, expected, replay, event_id, now = self.prepared
            s = self.snapshot
            with self.store.lock:
                current = self.store.data['cases'].get((s.actor.tenant_id, s.case.scope.request_id))
                before = self.original['cases'].get((s.actor.tenant_id, s.case.scope.request_id))
                if current is None or current.version != before.version:
                    raise VersionConflictError()
                # Existing P5-02 evaluator rechecks membership/case epochs and expiry.
                prior = self.repository.get_idempotency(current.tenant_id, s.actor.actor_id,
                    current.request_id, cmd.idempotency_key, action=cmd.action)
                checked = transition(current, cmd, s.actor, self.evaluator,
                                     event_id=event_id, now=now, prior=prior)
                if checked != expected:
                    raise InvalidTransitionError()
                self._validate_bundle(before, checked, replay)
                # Per-key delta merge: unrelated cases committed concurrently are not lost.
                merged = deepcopy(self.store.data)
                for table in ('cases', 'events', 'audits', 'reviews', 'revisions', 'idempotency'):
                    for key, value in self.local[table].items():
                        if key not in self.original[table] or value != self.original[table][key]:
                            if table not in ('cases', 'reviews') and key in merged[table]:
                                raise InvalidTransitionError()
                            merged[table][key] = value
                self.store.data = merged
            self.active = False
        except BaseException:
            self.rollback()
            raise

    def _validate_bundle(self, before, result, replay):
        expected = deepcopy(self.original)
        c, e = result.state, result.event
        if not replay:
            expected['cases'][(c.tenant_id, c.request_id)] = c
            expected['events'][e.event_id] = e
            expected['reviews'][(c.tenant_id, c.request_id)] = c.reviews
            added = {k: v for k, v in self.local['audits'].items() if k not in self.original['audits']}
            if len(added) != 1 or next(iter(added.values())).event != e:
                raise InvalidTransitionError()
            expected['audits'].update(added)
            for revision in c.reports[len(before.reports):]:
                expected['revisions'][(c.tenant_id, c.request_id, revision.content_revision_id)] = revision
            cmd = self.prepared[0]
            record = IdempotencyRecord(tenant_id=c.tenant_id, actor_id=e.actor_id, request_id=c.request_id,
                key=cmd.idempotency_key, payload_sha256=sha256(cmd.model_dump_json().encode()).hexdigest(), result=result)
            expected['idempotency'][idempotency_scope(record)] = record
        if expected != self.local:
            raise InvalidTransitionError()
        for artifact_id, digest in references(c):
            if (c.tenant_id, c.request_id, artifact_id, digest) not in self.store.data['references']:
                raise InvalidTransitionError()

    def commit(self):
        try:
            require_committable_business_operation(None)
        finally:
            self.rollback()

    def rollback(self):
        self.active = False
        self.local = None

    def __exit__(self, exc_type, exc, traceback):
        self.rollback()
