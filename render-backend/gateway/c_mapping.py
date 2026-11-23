"""Lossless Sandbox envelope + bounded C result candidate; never a Public API."""
from copy import deepcopy
from hashlib import sha256
from gateway.contract import schema_errors,NAMES
from ai_engine_core.models import digest,SourceReference,HumanReviewRequirement
from ai_engine_core.validation import validate_result
SOURCE_REVISION='SYNTHETIC_D_FIXED_4fb5abb60ce6daaf3305335c0a62704eb96a1294'
class MappingBlocked(ValueError):pass

def require(ok,code):
    if not ok:raise MappingBlocked(code)

def map_native(engine,native,raw):
    envelope=dict(status='BLOCKED',schema=NAMES[engine],public_dto=None,publication='BLOCKED_SANDBOX_ONLY',
        native_preserved=deepcopy(native),native_schema_errors=schema_errors(engine,native) if native else [],
        field_mapping=[],unmapped=[],citation_bindings=[],lossless_scope='SANDBOX_ENVELOPE_PRESERVES_FULL_NATIVE;C_CANDIDATE_IS_TYPED_RESULT_VIEW')
    if native is None:
        envelope['unmapped']=['CORE_WITHHELD'];return envelope
    try:
        require(native['engine_id']==engine==raw['engine_id'],'ENGINE_BINDING_MISMATCH')
        require(native['request_id']==raw['request_id'] and native['correlation_id']==raw['correlation_id'],'REQUEST_TRACE_BINDING_MISMATCH')
        require(native['source_refs']==raw['source_refs'],'SOURCE_BINDING_MISMATCH')
        require(native['status']=='ADVISORY' and native['errors']==[],'NATIVE_REJECTED')
        require(native['audit_metadata']['input_digest']==digest(raw),'INPUT_DIGEST_MISMATCH')
        require(native['audit_metadata']['output_digest']==digest(native['result_payload']),'OUTPUT_DIGEST_MISMATCH')
        human=HumanReviewRequirement(**native['requires_human_review'])
        require(human.required is True and human.can_approve is False and human.approval_status=='PENDING_HUMAN','HUMAN_DECISION_BOUNDARY')
        validate_result(engine,native['result_payload'],tuple(SourceReference.parse(r) for r in native['source_refs']),human)
        envelope['field_mapping']=[dict(native='requires_human_review.required',c='requiresHumanConfirmation',conversion='EXACT_BOOLEAN'),dict(native='model_metadata.model_version + fixed source',c='ruleOrModelVersion/sourceRevision',conversion='EXPLICIT_OFFLINE_SOURCE_IDENTITY')]
        if engine=='E1':
            envelope['unmapped']=['sourceReferences: non-text source digest profile not established','findings[].code/requested/reference: no typed C slots','structured_conditions/recommendation/supervisor_endorsement: no typed C slots']
            return envelope
        if engine=='E2':
            envelope['unmapped']=['outcome: advisory candidates cannot prove FEASIBLE or NO_FEASIBLE_SCHEDULE','scheduleRecommendations[].sampleCode/ownerId: not in native proposals','scheduleRecommendations[].allocations[].sample_count: no lossless C ScheduleInput field','physical capacity/completeness authority missing']
            return envelope
        if engine=='E3':
            envelope['unmapped']=['document: no original report document bytes and fixed DocumentRef','dataUnmodified: raw measurements preserved but not original document bytes proof','draft_data/checks/raw_data_digest: no typed C slots']
            return envelope
        result=native['result_payload'];p=raw['request_payload']
        require(p['fixture_only'] is True and p['version_policy']=='EXACT','SYNTHETIC_EXACT_SOURCE_REQUIRED')
        require(result['retrieval_status']=='FOUND','REFUSAL_MAPPING_NOT_ESTABLISHED')
        require(result['verified_regulatory_conclusion'] is False,'REGULATORY_AUTHORITY_FORBIDDEN')
        citations=[]
        for citation in result['citations']:
            ref=citation['ref'];matches=[d for d in p['documents'] if d['ref']==ref]
            require(len(matches)==1,'DOCUMENT_SOURCE_NOT_UNIQUE')
            doc=matches[0];text=doc['text'];require(citation['quote']==text,'QUOTE_NOT_LOSSLESS')
            require(ref in raw['source_refs'] and digest(text)==ref['digest'],'CANONICAL_SOURCE_DIGEST_MISMATCH')
            # C sha256 uses the known exact synthetic text UTF-8 bytes. Never
            # copy the D canonical-JSON digest or claim uploaded-document bytes.
            byte_sha=sha256(text.encode('utf-8')).hexdigest()
            public=dict(resourceType='document',resourceId=ref['document_id'],revision=ref['version'],locator=ref['locator'],documentVersion=ref['version'],sha256=byte_sha)
            citations.append(public)
            envelope['citation_bindings'].append(dict(native_ref=deepcopy(ref),c_citation=deepcopy(public),quote=text,utf8_bytes=len(text.encode('utf-8')),materialization='SYNTHETIC_UTF8_EXCERPT_NOT_UPLOADED_DOCUMENT'))
        require(bool(citations),'CITATIONS_REQUIRED')
        require(result['answer']=='\n'.join(b['quote'] for b in envelope['citation_bindings']),'ANSWER_NOT_EXACT_CITED_TEXT')
        public=dict(advisoryOnly=True,requiresHumanConfirmation=True,customerAuthorization='UNVERIFIED',ruleOrModelVersion='offline_rules/'+native['model_metadata']['model_version'],sourceReferences=deepcopy(citations),sourceRevision=SOURCE_REVISION,engine='assistant',outcome='answered',answer=result['answer'],citations=citations)
        errors=schema_errors(engine,public);envelope['candidate_schema_errors']=errors
        require(not errors,'FIXED_C_SCHEMA_REJECTED')
        envelope.update(status='C_SCHEMA_VALID_CANDIDATE',public_dto=public,
            field_mapping=envelope['field_mapping']+[dict(native='result_payload.answer',c='answer',conversion='BYTE_EXACT_STRING'),dict(native='result_payload.citations[].ref',c='citations[]/sourceReferences[]',conversion='IDENTITY_FIELDS_EXACT;CANONICAL_VS_UTF8_HASH_PROFILES_SEPARATE')])
        return envelope
    except (MappingBlocked,ValueError,TypeError,KeyError) as exc:
        envelope['status']='BLOCKED';envelope['public_dto']=None;envelope['unmapped']=[str(exc) if isinstance(exc,MappingBlocked) else 'INVALID_NATIVE_OR_SOURCE']
        return envelope
