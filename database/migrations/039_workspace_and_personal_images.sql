-- Account-owned images and shared tenant branding; no existing images or business rows are modified.
CREATE TABLE dqa_private.ui_images(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES dqa_business.tenants(id),
 owner_member_id uuid,kind text NOT NULL CHECK(kind IN('logo','avatar','signature')),image_data text,file_name text NOT NULL DEFAULT '',
 revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,owner_member_id) REFERENCES dqa_business.memberships(tenant_id,id) ON DELETE CASCADE,
 CHECK((kind='logo' AND owner_member_id IS NULL) OR (kind<>'logo' AND owner_member_id IS NOT NULL)),
 CHECK(image_data IS NULL OR octet_length(image_data)<=699100),CHECK(length(file_name)<=100)
);
CREATE UNIQUE INDEX ui_images_logo ON dqa_private.ui_images(tenant_id) WHERE kind='logo';
CREATE UNIQUE INDEX ui_images_owner ON dqa_private.ui_images(tenant_id,owner_member_id,kind) WHERE kind<>'logo';
ALTER TABLE dqa_private.ui_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dqa_private.ui_images FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ui_images_revision BEFORE UPDATE ON dqa_private.ui_images FOR EACH ROW EXECUTE FUNCTION dqa_private.touch_revision();
CREATE TRIGGER ui_images_audit AFTER INSERT OR UPDATE ON dqa_private.ui_images FOR EACH ROW EXECUTE FUNCTION dqa_private.record_audit();
CREATE FUNCTION dqa_business.workspace_images(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;result jsonb;
BEGIN
 actor:=dqa_private.member_id(p_tenant);IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_IMAGE_ACCESS_DENIED';END IF;
 SELECT jsonb_object_agg(k.kind,jsonb_build_object('image',i.image_data,'name',coalesce(i.file_name,''),'revision',coalesce(i.revision,0))) INTO result
 FROM unnest(ARRAY['logo','avatar','signature']) k(kind) LEFT JOIN dqa_private.ui_images i ON i.tenant_id=p_tenant AND i.kind=k.kind AND (k.kind='logo' OR i.owner_member_id=actor);
 RETURN jsonb_build_object('member_id',actor,'can_manage',dqa_private.is_admin(p_tenant),'images',result,'source','DATABASE');
END $$;
CREATE FUNCTION dqa_business.save_workspace_image(p_tenant uuid,p_kind text,p_image text,p_name text,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;item dqa_private.ui_images;raw bytea;mime text;encoded text;
BEGIN
 actor:=dqa_private.member_id(p_tenant);IF actor IS NULL OR (p_kind='logo' AND NOT dqa_private.is_admin(p_tenant)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_IMAGE_ACCESS_DENIED';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('logo','avatar','signature') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_name IS NULL OR length(p_name)>100 OR p_name ~ '[[:cntrl:]/\\]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_IMAGE_INVALID';END IF;
 IF p_image IS NULL THEN
  IF p_name<>'' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_IMAGE_INVALID';END IF;
 ELSE
  IF length(p_image)>699100 OR p_image!~'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_IMAGE_INVALID';END IF;
  mime:=split_part(split_part(p_image,';',1),':',2);encoded:=split_part(p_image,',',2);
  BEGIN raw:=decode(encoded,'base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_IMAGE_INVALID';END;
  IF octet_length(raw) NOT BETWEEN 12 AND 524288 OR replace(encode(raw,'base64'),E'\n','')<>encoded OR
    (mime='image/png' AND (octet_length(raw)<33 OR substring(raw FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex'))) OR
    (mime='image/jpeg' AND (substring(raw FROM 1 FOR 2)<>decode('ffd8','hex') OR substring(raw FROM octet_length(raw)-1 FOR 2)<>decode('ffd9','hex'))) OR
    (mime='image/webp' AND (p_kind='signature' OR substring(raw FROM 1 FOR 4)<>decode('52494646','hex') OR substring(raw FROM 9 FOR 4)<>decode('57454250','hex'))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WORKSPACE_IMAGE_INVALID';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ui-image:'||p_tenant||':'||CASE WHEN p_kind='logo' THEN 'workspace' ELSE actor::text END||':'||p_kind,0));
 IF dqa_private.member_id(p_tenant) IS DISTINCT FROM actor OR (p_kind='logo' AND NOT dqa_private.is_admin(p_tenant)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WORKSPACE_IMAGE_ACCESS_DENIED';END IF;
 SELECT * INTO item FROM dqa_private.ui_images WHERE tenant_id=p_tenant AND kind=p_kind AND (p_kind='logo' OR owner_member_id=actor) FOR UPDATE;
 IF coalesce(item.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT';END IF;
 IF item.id IS NULL THEN
  IF p_image IS NOT NULL THEN INSERT INTO dqa_private.ui_images(tenant_id,owner_member_id,kind,image_data,file_name) VALUES(p_tenant,CASE WHEN p_kind='logo' THEN NULL ELSE actor END,p_kind,p_image,p_name);END IF;
 ELSIF item.image_data IS DISTINCT FROM p_image OR item.file_name IS DISTINCT FROM p_name THEN UPDATE dqa_private.ui_images SET image_data=p_image,file_name=p_name WHERE id=item.id;END IF;
 RETURN dqa_business.workspace_images(p_tenant);
END $$;
REVOKE ALL ON FUNCTION dqa_business.workspace_images(uuid),dqa_business.save_workspace_image(uuid,text,text,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION dqa_business.workspace_images(uuid),dqa_business.save_workspace_image(uuid,text,text,text,bigint) TO authenticated;
