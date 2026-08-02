-- ============================================================
-- PHASE 4: AUDIT LOGS (SYSTEM ACTIVITY TRAIL)
-- ============================================================
-- Purpose:
--   Track CREATE/UPDATE/DELETE activity across core business tables.
--
-- Access model:
--   - Only system admins can read audit logs.
--   - Writes happen automatically via DB triggers.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  entity_table TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at ON public.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at ON public.audit_logs (entity_table, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_system_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_system_admin_select ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_system_admin());

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor UUID := auth.uid();
  row_tenant_id UUID;
  row_record_id TEXT;
  old_payload JSONB;
  new_payload JSONB;
  op TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    op := 'CREATE';
    new_payload := to_jsonb(NEW);
    old_payload := NULL;
    row_tenant_id := (to_jsonb(NEW)->>'tenant_id')::uuid;
    row_record_id := to_jsonb(NEW)->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    op := 'UPDATE';
    old_payload := to_jsonb(OLD);
    new_payload := to_jsonb(NEW);
    row_tenant_id := COALESCE((to_jsonb(NEW)->>'tenant_id')::uuid, (to_jsonb(OLD)->>'tenant_id')::uuid);
    row_record_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id');
  ELSIF TG_OP = 'DELETE' THEN
    op := 'DELETE';
    old_payload := to_jsonb(OLD);
    new_payload := NULL;
    row_tenant_id := (to_jsonb(OLD)->>'tenant_id')::uuid;
    row_record_id := to_jsonb(OLD)->>'id';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_table,
    record_id,
    old_data,
    new_data
  ) VALUES (
    row_tenant_id,
    actor,
    op,
    TG_TABLE_NAME,
    row_record_id,
    old_payload,
    new_payload
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers',
    'employees',
    'expenses',
    'income',
    'invoices',
    'payments',
    'orders',
    'products',
    'suppliers',
    'user_tenants'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
        t,
        t
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
