"""TEST_ONLY: reuse P5-03 bytes + P5-05 store/UoW, not real adapters.

One shared RLock models a synthetic linearization point; it proves no SQL,
Storage conditional-write, scanner or distributed atomicity property.
"""
from datetime import datetime, timezone
from hashlib import sha256
from uuid import uuid4
from app.authz.adapters.context import AuthorizationSnapshot
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.core.errors import AuthorizationError, IdempotencyConflictError
from app.core.receipt_dependencies import ReceiptDependencyUnavailable
from app.domain.permissions import Permission
from app.domain.workflow import require_committable_business_operation
from app.ports.transaction_contract import idempotency_scope
from app.schemas.artifacts import ArtifactIntegrityError, ArtifactUnavailableError
from app.schemas.commands import SubmitReport
from app.schemas.storage_receipts import (StorageReceipt, StoragePhase, PublishOutcome,
    object_key_for, validate_receipt_binding)
from immutable_artifacts.fakes import MemoryArtifacts
from repository_contract.fakes import MemoryUnitOfWork


class SyntheticAuthority:
    def __init__(self, store, clock):
        self.store, self.clock = store, clock
        self._snapshots = []

    def admit_fixture_snapshot(self, snapshot):
        # Trusted test composition ONLY; never called by a client-facing method.
        self._snapshots.append(snapshot)

    def authorize(self, authorization, descriptor, permission):
        if (not isinstance(authorization, AuthorizationSnapshot)
                or not any(authorization is s for s in self._snapshots)
                or (descriptor.tenant_id, descriptor.case_id) != (
                    authorization.actor.tenant_id, authorization.case.scope.request_id)):
            raise AuthorizationError()
        evaluator = SnapshotPermissionEvaluator(authorization, self.store, self.clock, mode='TEST_ONLY')
        if evaluator.evaluate(authorization.actor, authorization.case.scope, permission).allowed is not True:
            raise AuthorizationError()


class SyntheticObjects(MemoryArtifacts):
    def __init__(self, store, clock, authz, *, receipt_ttl, grace_period):
        super().__init__(store, clock)
        if receipt_ttl <= 0 or grace_period <= 0:
            raise ValueError('Explicit synthetic timing required')
        self.authz, self.ttl, self.grace = authz, receipt_ttl, grace_period
        self.phases, self.generations, self.created = {}, {}, {}
        self.receipts, self.sources, self.revoked = {}, {}, set()
        self.reserved_keys, self.revision_originals = set(), {}
        self.unknown, self.pending, self.cleanup_claims = set(), set(), {}
        self.outcomes_available = True

    def publish_synthetic_for_test(self, *args, **kwargs):
        # Disable the predecessor's metadata-only fixture publication shortcut.
        require_committable_business_operation(None)

    def append_revision(self, *args, **kwargs):
        # DB references belong to the original UoW, never the bytes provider.
        require_committable_business_operation(None)

    def _authorize(self, authorization, descriptor, permission):
        self.authz.authorize(authorization, descriptor, permission)
        super()._authorize(authorization, descriptor, permission)

    def bind_original_for_test(self, descriptor):
        key = (descriptor.tenant_id, descriptor.case_id, descriptor.revision_id)
        if key in self.revision_originals:
            raise ArtifactIntegrityError()
        self.revision_originals[key] = descriptor.artifact_id

    def put_new_bytes(self, reference, content, *, authorization, fault=None, object_key=None):
        with self.lock:
            self._authorize(authorization, reference, Permission.ARTIFACT_WRITE)
            key = object_key_for(reference)
            if object_key is not None and object_key != key:
                raise ArtifactIntegrityError()
            if key in self.reserved_keys or reference.artifact_id in self.phases:
                raise ArtifactIntegrityError()
            self.reserved_keys.add(key)
            self.phases[reference.artifact_id] = StoragePhase.UPLOAD_ATTEMPT
            self.created[reference.artifact_id] = self.clock.now()
            self.phases[reference.artifact_id] = StoragePhase.QUARANTINED
            if fault == 'interrupted':
                raise TimeoutError('SYNTHETIC_UPLOAD_INTERRUPTED')
            try:
                super().put_new_bytes(reference, content, authorization=authorization)
            except Exception:
                self.phases[reference.artifact_id] = StoragePhase.REJECTED
                raise
            self.generations[reference.artifact_id] = str(uuid4())
            if fault == 'response_lost':
                self.unknown.add(reference.artifact_id)
                raise TimeoutError('SYNTHETIC_UPLOAD_ACK_LOST')

    def verify_private(self, descriptor, *, authorization):
        with self.lock:
            self._authorize(authorization, descriptor, Permission.ARTIFACT_WRITE)
            if (self.phases.get(descriptor.artifact_id) not in (
                    StoragePhase.QUARANTINED, StoragePhase.VERIFIED_PRIVATE)
                    or descriptor.artifact_id in self.unknown):
                raise ArtifactUnavailableError()
            self._verified(descriptor, published=False)
            binding = (descriptor.tenant_id, descriptor.case_id, descriptor.revision_id)
            original = self.revision_originals.get(binding)
            if not original:
                raise ArtifactIntegrityError()
            source_receipts = []
            for source_id in descriptor.source_artifact_ids:
                source = next((r for r in self.receipts.values() if r.artifact_id == source_id), None)
                if source is None:
                    raise ArtifactIntegrityError()
                self.attest(source, source.descriptor(), authorization=authorization)
                source_receipts.append(source)
            if (descriptor.artifact_kind == 'original_excel' and descriptor.artifact_id != original
                    or descriptor.artifact_kind == 'signed_excel' and original not in descriptor.source_artifact_ids):
                raise ArtifactIntegrityError()
            # PDF ancestry must ultimately reach the authoritative original, not any Excel.
            if descriptor.artifact_kind == 'report_pdf':
                ancestor_ids = set(descriptor.source_artifact_ids)
                for source in source_receipts:
                    ancestor_ids.update(source.source_artifact_ids)
                if original not in ancestor_ids:
                    raise ArtifactIntegrityError()
            existing = next((r for r in self.receipts.values() if r.artifact_id == descriptor.artifact_id), None)
            if existing is not None:
                return self.attest(existing, descriptor, authorization=authorization)
            receipt = StorageReceipt(**descriptor.model_dump(), receipt_id=uuid4(),
                object_key=object_key_for(descriptor), storage_generation=self.generations[descriptor.artifact_id],
                verification_status='VERIFIED_PRIVATE', verification_time=float(self.clock.now()),
                expires_at=float(self.clock.now()+self.ttl),
                verification_policy='TEST_ONLY_SYNTHETIC_BYTES_V1')
            self.receipts[receipt.receipt_id] = receipt
            self.sources[receipt.receipt_id] = tuple(source_receipts)
            self.phases[descriptor.artifact_id] = StoragePhase.VERIFIED_PRIVATE
            return receipt

    def attest(self, receipt, descriptor, *, authorization):
        with self.lock:
            self._authorize(authorization, descriptor, Permission.ARTIFACT_WRITE)
            receipt = validate_receipt_binding(receipt, descriptor, now=self.clock.now())
            if (self.receipts.get(receipt.receipt_id) != receipt or receipt.receipt_id in self.revoked
                    or self.generations.get(receipt.artifact_id) != receipt.storage_generation
                    or receipt.artifact_id in self.unknown
                    or self.phases.get(receipt.artifact_id) not in (
                        StoragePhase.VERIFIED_PRIVATE, StoragePhase.REFERENCE_PENDING,
                        StoragePhase.REFERENCE_PUBLISHED)):
                raise ArtifactIntegrityError()
            self._verified(descriptor, published=False)
            for source in self.sources[receipt.receipt_id]:
                self.attest(source, source.descriptor(), authorization=authorization)
            return receipt

    def get_bytes(self, reference, *, authorization):
        with self.lock:
            self._authorize(authorization, reference, Permission.ARTIFACT_READ)
            receipt = next((r for r in self.receipts.values() if r.artifact_id == reference.artifact_id), None)
            if receipt is None:
                raise ArtifactUnavailableError()
            # Attestation checks bytes without requiring write rights for a reader.
            # Use the same scoped/fresh snapshot, but no grant expansion.
            self._attest_read(receipt, reference, authorization)
            return super().get_bytes(reference, authorization=authorization)

    def _attest_read(self, receipt, reference, authorization):
        self._authorize(authorization, reference, Permission.ARTIFACT_READ)
        validate_receipt_binding(receipt, reference, now=self.clock.now())
        if (self.receipts.get(receipt.receipt_id) != receipt or receipt.receipt_id in self.revoked
                or self.generations.get(reference.artifact_id) != receipt.storage_generation
                or self.phases.get(reference.artifact_id) != StoragePhase.REFERENCE_PUBLISHED
                or reference.artifact_id in self.unknown):
            raise ArtifactIntegrityError()
        self._verified(reference, published=True)
        for source in self.sources[receipt.receipt_id]:
            self._attest_read(source, source.descriptor(), authorization)

    def inspect(self, receipt, *, authorization):
        with self.lock:
            self._authorize(authorization, receipt.descriptor(), Permission.ARTIFACT_WRITE)
            canonical = self.receipts.get(receipt.receipt_id)
            if canonical != receipt or self.generations.get(receipt.artifact_id) != receipt.storage_generation:
                raise ArtifactIntegrityError()
            aid = receipt.artifact_id
            if (not self.outcomes_available or aid in self.unknown or aid in self.pending
                    or any(r[2] == aid for r in self.authority.data['references'])
                    or self.phases.get(aid) == StoragePhase.REFERENCE_PUBLISHED):
                return 'NO_DELETE'
            if self.clock.now() < self.created[aid] + self.grace:
                return 'WAIT_GRACE'
            if aid in self.cleanup_claims:
                return 'CLEANUP_PENDING'
            self.phases[aid] = StoragePhase.ORPHAN_CANDIDATE
            return 'ELIGIBLE_FOR_CLAIM_ONLY'

    def claim_cleanup_for_test(self, receipt, *, authorization):
        # No delete exists, including for memory bytes. Lock + generation model only.
        with self.lock:
            if self.inspect(receipt, authorization=authorization) != 'ELIGIBLE_FOR_CLAIM_ONLY':
                raise ArtifactIntegrityError()
            self.cleanup_claims[receipt.artifact_id] = (receipt.storage_generation, uuid4())
            self.phases[receipt.artifact_id] = StoragePhase.CLEANUP_PENDING
            return self.cleanup_claims[receipt.artifact_id]


class SyntheticReferencePublisher:
    def __init__(self, objects, authz, clock):
        self.objects, self.authz, self.clock = objects, authz, clock
        self.store = objects.authority

    def _bundle(self, command, receipts, authorization, *, reconciling=False):
        if type(command) is not SubmitReport or type(receipts) is not tuple:
            raise ArtifactIntegrityError()
        command = SubmitReport.model_validate(command.model_dump())
        if any(type(r) is not StorageReceipt for r in receipts):
            raise ArtifactIntegrityError()
        expected = [(command.revision.original, 'original_excel'),
                    (command.executor_signature, 'signature_image')]
        if len(receipts) != len(expected) or len({r.artifact_id for r in receipts}) != len(expected):
            raise ArtifactIntegrityError()
        by_id = {r.artifact_id: r for r in receipts}
        for ref, kind in expected:
            r = by_id.get(ref.artifact_id)
            if r is None:
                raise ArtifactIntegrityError()
            descriptor = r.descriptor()
            self.authz.authorize(authorization, descriptor, Permission.REPORT_SUBMIT)
            if reconciling and (not self.objects.outcomes_available
                                or r.artifact_id in self.objects.unknown | self.objects.pending):
                validate_receipt_binding(r, descriptor, now=self.clock.now())
                if self.objects.receipts.get(r.receipt_id) != r:
                    raise ArtifactIntegrityError()
            else:
                self.objects.attest(r, descriptor, authorization=authorization)
            if (r.sha256 != ref.sha256 or r.artifact_kind != kind
                    or r.revision_id != command.revision.content_revision_id
                    or kind == 'signature_image' and r.signer_id != ref.signer_id):
                raise ArtifactIntegrityError()
        return command

    def publish(self, command, receipts, *, authorization, before_commit=None, fault=None):
        # No externally callable business publication. Explicit TEST_ONLY harness.
        with self.store.lock:
            command = self._bundle(command, receipts, authorization)
            ids = {r.artifact_id for r in receipts}
            if ids & self.objects.pending or ids & self.objects.unknown:
                raise ReceiptDependencyUnavailable()
            phases = dict(self.objects.phases)
            published = {k: v['published'] for k,v in self.objects._objects.items()}
            committed = False
            publication_before = None
            try:
                self.objects.pending.update(ids)
                for aid in ids:
                    self.objects.phases[aid] = StoragePhase.REFERENCE_PENDING
                with MemoryUnitOfWork(self.store, authorization, self.clock) as uow:
                    fail_after = int(fault[-1]) if fault in {f'stage_{i}' for i in range(6)} else None
                    result = uow.prepare(command, event_id=uuid4(),
                        now=datetime.fromtimestamp(self.clock.now(), timezone.utc), fail_after=fail_after)
                    if before_commit is not None:
                        before_commit()
                    # Recheck provider evidence, epochs, revision and current case CAS.
                    self._bundle(command, receipts, authorization)
                    if fault == 'db_failure':
                        raise RuntimeError('SYNTHETIC_DB_ROLLBACK')
                    if fault == 'outcome_unknown':
                        self.objects.unknown.update(ids)
                        raise ReceiptDependencyUnavailable()
                    publication_before = self.store.snapshot()
                    self.store.data['references'].update((r.tenant_id,r.case_id,r.artifact_id,r.sha256)
                                                          for r in receipts)
                    uow.publish_synthetic_for_test()
                    if fault == 'visibility_failure':
                        raise RuntimeError('SYNTHETIC_VISIBILITY_FAILURE')
                    for aid in ids:
                        self.objects._objects[aid]['published'] = True
                        self.objects.phases[aid] = StoragePhase.REFERENCE_PUBLISHED
                    committed = True
                if fault == 'response_lost':
                    raise TimeoutError('SYNTHETIC_DB_ACK_LOST')
                return result
            except BaseException:
                if not committed:
                    # Roll back only this boundary's changes. A fault callback may
                    # model another writer; do not restore its case or revocation.
                    if publication_before is not None:
                        # Restore our whole synthetic commit, not just references.
                        # The snapshot is AFTER the external-writer callback;
                        # no other writer can enter this shared lock now.
                        self.store.data = publication_before
                    for aid in ids:
                        self.objects.phases[aid] = phases[aid]
                        self.objects._objects[aid]['published'] = published[aid]
                raise
            finally:
                self.objects.pending.difference_update(ids)

    def reconcile(self, command, receipts, *, authorization):
        with self.store.lock:
            command = self._bundle(command, receipts, authorization, reconciling=True)
            if (not self.objects.outcomes_available
                    or any(r.artifact_id in self.objects.unknown | self.objects.pending for r in receipts)):
                return PublishOutcome(status='UNKNOWN')
            s = authorization
            key = (s.actor.tenant_id, s.actor.actor_id, s.case.scope.request_id,
                   command.action, command.idempotency_key)
            record = self.store.data['idempotency'].get(key)
            if record is not None:
                if record.payload_sha256 != sha256(command.model_dump_json().encode()).hexdigest():
                    raise IdempotencyConflictError()
                # No second idempotency ledger: require its complete original bundle.
                data = self.store.data
                event = record.result.event
                revision = command.revision.model_copy(update={'signatures':(command.executor_signature,)})
                if (idempotency_scope(record) != key
                        or event.version != command.expected_version+1
                        or data['events'].get(event.event_id) != event
                        or not any(a.event == event for a in data['audits'].values())
                        or data['revisions'].get((key[0],key[2],revision.content_revision_id)) != revision
                        or revision not in record.result.state.reports
                        or not all((r.tenant_id,r.case_id,r.artifact_id,r.sha256)
                                   in data['references'] for r in receipts)):
                    return PublishOutcome(status='UNKNOWN')
                return PublishOutcome(status='CONFIRMED', event_id=record.result.event.event_id)
            if any(r.artifact_id in self.objects.unknown | self.objects.pending for r in receipts):
                return PublishOutcome(status='UNKNOWN')
            if (any((r.tenant_id,r.case_id,r.artifact_id,r.sha256) in self.store.data['references']
                    for r in receipts)
                    or self.store.data['cases'][(key[0],key[2])].version != command.expected_version):
                return PublishOutcome(status='UNKNOWN')
            return PublishOutcome(status='NOT_COMMITTED')

    def commit(self):
        require_committable_business_operation(None)
