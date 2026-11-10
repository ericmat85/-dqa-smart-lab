"""No image decoder. Only immutable, server-curated synthetic descriptors.

Hints are fixture specifications, NOT measurements from decoded image pixels.
No file, base64, URL, biometric, or signature identity operations are implemented.
"""
from types import MappingProxyType

DESCRIPTOR_MEDIA_TYPE='application/vnd.dqa.synthetic-signature-descriptor+json'
MAX_SIGNATURE_BODY_BYTES=8192
MAX_RAW_IMAGE_BYTES=0
MAX_BASE64_CHARACTERS=0
MAX_DESCRIPTOR_WIDTH_HINT=512
MAX_DESCRIPTOR_HEIGHT_HINT=256
DESCRIPTORS=MappingProxyType({
 'synthetic-clear-v1':(256,96,'Synthetic illustration: complete dark mark on a clean background; no actual image supplied.'),
 'synthetic-blurry-v1':(256,96,'Synthetic illustration: blurred mark; manual review needed; no actual image supplied.'),
 'synthetic-cropped-v1':(256,96,'Synthetic illustration: mark touches border and may be incomplete; no actual image supplied.'),
 'synthetic-faint-v1':(256,96,'Synthetic illustration: low contrast and faint strokes; no actual image supplied.'),
 'synthetic-background-v1':(256,96,'Synthetic illustration: background interference or occlusion; no actual image supplied.'),
})


def descriptor_prompt_data(request):
    fixture=request.synthetic_signature_image.fixture_id
    width,height,description=DESCRIPTORS[fixture]
    if not 1<=width<=MAX_DESCRIPTOR_WIDTH_HINT or not 1<=height<=MAX_DESCRIPTOR_HEIGHT_HINT:
        raise ValueError('Invalid server synthetic descriptor')
    return {'schema_version':request.schema_version,'synthetic':True,'fixture_id':fixture,
        'logical_width_hint':width,'logical_height_hint':height,'description':description,
        'provenance':'SERVER_CURATED_SYNTHETIC_DESCRIPTOR_NOT_DECODED_IMAGE',
        'image_decoding':'NOT_IMPLEMENTED','context':'quality_only'}
