CREATE OR REPLACE FUNCTION public.owner_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_role text;
  target_email text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only Owner / Super Admin accounts may delete users.';
  END IF;

  IF target_user_id = caller_id THEN
    RAISE EXCEPTION 'Your current Owner account cannot be deleted.';
  END IF;

  SELECT up.role INTO target_role
  FROM public.user_profiles up
  WHERE up.id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'That user does not have a CRM profile.';
  END IF;

  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'Owner / Super Admin accounts cannot be deleted from the CRM.';
  END IF;

  SELECT u.email INTO target_email
  FROM auth.users u
  WHERE u.id = target_user_id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'That user account no longer exists.';
  END IF;

  INSERT INTO public.crm_audit_log (actor_id, action, module, record_id, details)
  VALUES (
    caller_id,
    'delete_user',
    'user_management',
    target_user_id::text,
    jsonb_build_object('target_email', target_email, 'target_role', target_role)
  );

  DELETE FROM auth.users WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The user account could not be deleted.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'email', target_email,
    'user_id', target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_delete_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delete_user(uuid) TO authenticated;
