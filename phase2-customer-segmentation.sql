-- ============================================================
-- PHASE 2: CUSTOMER SEGMENTATION
-- ============================================================
-- Purpose:
--   Separate product buyers from other business/service clients.
--
-- Segments:
--   1) product_buyer  -> uses Customers page
--   2) service_client -> uses Clients page
-- ============================================================

BEGIN;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS customer_segment TEXT;

-- Guardrail trigger validates membership for each row and blocks
-- cross-tenant admin backfills. Temporarily disable only on customers.
ALTER TABLE public.customers DISABLE TRIGGER trg_enforce_tenant_customers;

UPDATE public.customers
SET customer_segment = 'product_buyer'
WHERE customer_segment IS NULL;

ALTER TABLE public.customers ENABLE TRIGGER trg_enforce_tenant_customers;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_customer_segment_allowed_values'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_segment_allowed_values
      CHECK (customer_segment IN ('product_buyer', 'service_client'));
  END IF;
END $$;

ALTER TABLE public.customers
ALTER COLUMN customer_segment SET DEFAULT 'product_buyer';

ALTER TABLE public.customers
ALTER COLUMN customer_segment SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_segment_created_at
ON public.customers (tenant_id, customer_segment, created_at DESC);

COMMIT;
