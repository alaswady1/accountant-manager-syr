-- ============================================================
-- PHASE 2C: FIX GUARDRail MEMBERSHIP CHECK IN TRIGGER
-- ============================================================
-- Purpose:
--   Make tenant membership validation reliable even if RLS affects
--   visibility of public.user_tenants for the caller role.
--
-- Why this is needed:
--   enforce_row_tenant_membership() currently checks membership with
--   caller privileges. Under strict RLS/policy conditions this can
--   evaluate false even when membership exists.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_current_user_member_of_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = p_tenant_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_member_of_tenant(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_row_tenant_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_tenant UUID;
  has_membership BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No authenticated user found in request context.';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    resolved_tenant := public.current_user_default_tenant_id();
    NEW.tenant_id := resolved_tenant;
  ELSE
    resolved_tenant := NEW.tenant_id;
  END IF;

  IF resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context found for current user.';
  END IF;

  SELECT public.is_current_user_member_of_tenant(resolved_tenant)
  INTO has_membership;

  IF NOT has_membership THEN
    RAISE EXCEPTION 'User is not a member of tenant %', resolved_tenant;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
