-- ============================================================
-- PHASE 3B: SYSTEM ADMIN ACCESS MODEL
-- ============================================================
-- Purpose:
--   Make admin control panel access global (system admin only),
--   not tenant-admin based.
--
-- Includes:
--   1) system_admins table
--   2) helper function public.is_system_admin()
--   3) user_tenants admin policies rewritten to system-admin checks
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_admins_self_select ON public.system_admins;
DROP POLICY IF EXISTS system_admins_no_mutation ON public.system_admins;

CREATE POLICY system_admins_self_select ON public.system_admins
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- No public insert/update/delete policy on purpose.

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_admins sa
    WHERE sa.user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;

-- Keep self-read policy.
DROP POLICY IF EXISTS user_tenants_admin_select ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_admin_insert ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_admin_update ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_admin_delete ON public.user_tenants;

CREATE POLICY user_tenants_admin_select ON public.user_tenants
FOR SELECT
TO authenticated
USING (public.is_system_admin());

CREATE POLICY user_tenants_admin_insert ON public.user_tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin());

CREATE POLICY user_tenants_admin_update ON public.user_tenants
FOR UPDATE
TO authenticated
USING (public.is_system_admin())
WITH CHECK (public.is_system_admin());

CREATE POLICY user_tenants_admin_delete ON public.user_tenants
FOR DELETE
TO authenticated
USING (public.is_system_admin());

COMMIT;
