-- ============================================================
-- PHASE 2B: AUTO-HEAL CURRENT USER TENANT MEMBERSHIP
-- ============================================================
-- Purpose:
--   Prevent runtime "No tenant membership found" by ensuring every
--   authenticated user can be mapped to a default tenant at write-time.
--
-- Run after:
--   1) phase1-tenancy-foundation.sql
--   2) phase1-rls-rewrite-templates.sql
--   3) phase1b-tenancy-guardrails.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_current_user_tenant_membership()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID := auth.uid();
  existing_tenant UUID;
  default_tenant UUID;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ut.tenant_id
  INTO existing_tenant
  FROM public.user_tenants ut
  WHERE ut.user_id = uid
  ORDER BY ut.is_default DESC, ut.created_at ASC
  LIMIT 1;

  IF existing_tenant IS NOT NULL THEN
    RETURN existing_tenant;
  END IF;

  SELECT t.id
  INTO default_tenant
  FROM public.tenants t
  WHERE t.slug = 'default-company'
  LIMIT 1;

  IF default_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_tenants (user_id, tenant_id, membership_role, is_default)
  VALUES (uid, default_tenant, 'member', true)
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET is_default = true;

  RETURN default_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user_tenant_membership() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_default_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT public.ensure_current_user_tenant_membership()
$$;

COMMIT;
