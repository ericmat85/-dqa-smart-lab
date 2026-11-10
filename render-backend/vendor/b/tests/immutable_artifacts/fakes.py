"""TEST ONLY memory bytes adapter; no HTTP, filesystem, Auth or Storage client.

Reuse P5-05 MemoryStore/freshness/lock rather than a second UoW model.
Published artifact availability is not a business approval or a SQL commit.
"""
from copy import deepcopy
from app.authz.adapters.context import AuthorizationSnapshot
from app.authz.adapters.evaluator import SnapshotPermissionEvaluator
from app.core.errors import AuthorizationError, InvalidTransitionError
from app.domain.permissions import Permission
from app.domain.workflow import require_committable_business_operation
from app.schemas.artifacts import (ArtifactDescriptor, ArtifactIntegrityError,
    ArtifactUnavailableError, validate_content)
from app.schemas.reports import ReportRevisionRef


class MemoryArtifacts:
    def __init__(self, authority, clock):
        self.authority, self.clock = authority, clock
        self.lock = authority.lock
        self._objects = {}
        self._used_ids = set()
        self._revision_bindings = set()
        self._revision_refs = {}

    def bind_revision_for_test(self, case, revision_id):
        # Trusted fixture/setup only; not a business revision creation endpoint.
        with self.lock:
            if (case.tenant_id, case.request_id) not in self.authority.data['cases']:
                raise InvalidTransitionError()
            self._revision_bindings.add((case.tenant_id, case.request_id, revision_id))

    def _authorize(self, authorization, descriptor, permission):
        if not isinstance(authorization, AuthorizationSnapshot) or not isinstance(descriptor, ArtifactDescriptor):
            raise AuthorizationError()
        scope = authorization.case.scope
        if ((descriptor.tenant_id, descriptor.case_id) != (scope.tenant_id, scope.request_id)
                or (scope.tenant_id, scope.request_id, descriptor.revision_id) not in self._revision_bindings):
            raise AuthorizationError()
        evaluator = SnapshotPermissionEvaluator(authorization, self.authority, self.clock, mode='TEST_ONLY')
        if evaluator.evaluate(authorization.actor, scope, permission).allowed is not True:
            raise AuthorizationError()

    def _sources(self, descriptor, visiting=None):
        visiting = set() if visiting is None else visiting
        if descriptor.artifact_id in visiting:
            raise ArtifactIntegrityError()
        visiting = visiting | {descriptor.artifact_id}
        kinds = set()
        for source_id in descriptor.source_artifact_ids:
            row = self._objects.get(source_id)
            if row is None:
                raise ArtifactUnavailableError()
            source = validate_content(row['descriptor'], row['content'])
            if (source.tenant_id, source.case_id, source.revision_id) != (
                    descriptor.tenant_id, descriptor.case_id, descriptor.revision_id):
                raise ArtifactIntegrityError()
            self._sources(source, visiting)
            kinds.add(source.artifact_kind)
        if descriptor.artifact_kind == 'signed_excel' and not {'original_excel','signature_image'} <= kinds:
            raise ArtifactIntegrityError()
        if descriptor.artifact_kind == 'report_pdf' and not kinds & {'original_excel','signed_excel'}:
            raise ArtifactIntegrityError()

    def put_new_bytes(self, reference, content, *, authorization, fail_before_store=False):
        with self.lock:
            self._authorize(authorization, reference, Permission.ARTIFACT_WRITE)
            if reference.created_by != authorization.actor.actor_id:
                raise AuthorizationError()
            checked = validate_content(reference, content)
            if checked.artifact_id in self._used_ids:
                raise ArtifactIntegrityError()
            self._sources(checked)
            # Reserve ID permanently: retries query existing status or use a new ID.
            self._used_ids.add(checked.artifact_id)
            if fail_before_store:
                raise RuntimeError('SYNTHETIC_WRITE_FAILURE')
            self._objects[checked.artifact_id] = {'descriptor':checked,'content':content,'published':False}

    def _verified(self, reference, *, published):
        row = self._objects.get(reference.artifact_id)
        if row is None or (published and not row['published']):
            raise ArtifactUnavailableError()
        checked = validate_content(row['descriptor'], row['content'])
        if checked != reference:
            raise ArtifactIntegrityError()
        self._sources(checked)
        return row

    def publish_synthetic_for_test(self, references, *, authorization, fail_before_publish=False):
        # One in-memory visibility boundary, not SQL + Storage atomicity.
        with self.lock:
            if not references or len({r.artifact_id for r in references}) != len(references):
                raise ArtifactIntegrityError()
            rows = []
            batch = {r.artifact_id for r in references}
            for reference in references:
                self._authorize(authorization, reference, Permission.ARTIFACT_WRITE)
                row = self._verified(reference, published=False)
                if row['published']:
                    raise ArtifactIntegrityError()
                if any(not self._objects[s]['published'] and s not in batch for s in reference.source_artifact_ids):
                    raise ArtifactIntegrityError()
                rows.append(row)
            if fail_before_publish:
                raise RuntimeError('SYNTHETIC_PUBLICATION_FAILURE')
            for row in rows:
                row['published'] = True

    def get_bytes(self, reference, *, authorization):
        with self.lock:
            self._authorize(authorization, reference, Permission.ARTIFACT_READ)
            row = self._verified(reference, published=True)
            # Only return after all checks; never stream partial unverified bytes.
            return row['content']

    def append_revision(self, tenant_id, request_id, revision, *, authorization,
                        fail_before_reference_publish=False):
        """Publish only reference metadata after real bytes verification.

        No business CaseState mutation: P5-05's normal transition/bundle/gate
        remains required. Uploaded bytes survive a later metadata failure.
        """
        with self.lock:
            if not isinstance(revision, ReportRevisionRef):
                raise ArtifactIntegrityError()
            try:
                revision = ReportRevisionRef.model_validate(revision.model_dump())
            except (ValueError, TypeError):
                raise ArtifactIntegrityError() from None
            refs = [(revision.original, 'original_excel')]
            refs += [(s, 'signature_image') for s in revision.signatures]
            refs += [(r, None) for r in revision.signed_artifacts]
            verified = []
            for ref, kind in refs:
                row = self._objects.get(ref.artifact_id)
                if row is None:
                    raise ArtifactUnavailableError()
                d = row['descriptor']
                self._authorize(authorization, d, Permission.ARTIFACT_WRITE)
                self._verified(d, published=True)
                if ((d.tenant_id,d.case_id,d.revision_id,d.sha256) !=
                        (tenant_id,request_id,revision.content_revision_id,ref.sha256)
                        or (kind is not None and d.artifact_kind != kind)
                        or (kind is None and d.artifact_kind not in ('signed_excel','report_pdf'))
                        or (kind == 'signature_image' and d.signer_id != ref.signer_id)):
                    raise ArtifactIntegrityError()
                verified.append((d.tenant_id,d.case_id,d.artifact_id,d.sha256))
            ids = [ref.artifact_id for ref,_ in refs]
            if len(ids) != len(set(ids)):
                raise ArtifactIntegrityError()
            key = (tenant_id, request_id, revision.content_revision_id)
            if key in self._revision_refs:
                raise ArtifactIntegrityError()
            # Publish validated IDs/hashes only; no invented P5-05 metadata-only trust.
            merged = self.authority.data['references'] | set(verified)
            if fail_before_reference_publish:
                raise RuntimeError('SYNTHETIC_REFERENCE_PUBLICATION_FAILURE')
            self._revision_refs[key] = revision
            self.authority.data['references'] = merged

    def inspect_for_test(self):
        with self.lock:
            return deepcopy(self._objects)

    def commit(self):
        require_committable_business_operation(None)
