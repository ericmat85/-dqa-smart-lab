"""Pinned C validation, with no public projection or approval claim."""
from pathlib import Path
import hashlib,yaml
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
R=Path(__file__).resolve().parents[1]
data=(R/'inbox/c/proposed-api-contract.openapi.yaml').read_bytes()
if hashlib.sha256(data).hexdigest()!='7400a46d98eece6efd49c4ef4a19761cade8e08fc3daf2fae513fdf9a9fe25d8':raise RuntimeError('C_CONTRACT_HASH_MISMATCH')
contract=yaml.safe_load(data)
registry=Registry().with_resource('urn:dqa:c',Resource.from_contents({'$schema':'https://json-schema.org/draft/2020-12/schema',**contract}))
NAMES={'E1':'AIRequestResult','E2':'AIScheduleResult','E3':'AIReportResult','E4':'AIAssistantResult'}
def validate_native(engine,native):
 if native is None:return dict(status='NOT_RUN_CORE_WITHHELD',public_projection='BLOCKED')
 name=NAMES[engine];v=Draft202012Validator({'$ref':f'urn:dqa:c#/components/schemas/{name}'},registry=registry)
 errors=list(v.iter_errors(native))
 return dict(status='REJECTED_NATIVE_NOT_PUBLIC_DTO' if errors else 'STRUCTURAL_MATCH_ONLY_NOT_APPROVAL',schema=name,contract_version=contract['info']['version'],error_count=len(errors),public_projection='BLOCKED',reason='No approved lossless mapping or formal source authority')

def schema_errors(engine,value):
    """Exact paths against the unchanged C document; validation never coerces."""
    validator=Draft202012Validator({'$ref':f'urn:dqa:c#/components/schemas/{NAMES[engine]}'},registry=registry)
    return [dict(path='/'+ '/'.join(map(str,e.absolute_path)),schema_path='/'+ '/'.join(map(str,e.absolute_schema_path)),validator=e.validator,message=e.message) for e in validator.iter_errors(value)]
