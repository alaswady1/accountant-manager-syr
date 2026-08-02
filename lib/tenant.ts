import { supabase } from './supabase';

let cachedTenantId: string | null = null;
let cachedTenantUserId: string | null = null;

export async function getCurrentTenantId(forceRefresh = false): Promise<string | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    cachedTenantId = null;
    cachedTenantUserId = null;
    return null;
  }

  // Prevent cross-user cache leaks after logout/login in the same browser tab.
  if (cachedTenantUserId && cachedTenantUserId !== user.id) {
    cachedTenantId = null;
    cachedTenantUserId = null;
  }

  if (!forceRefresh && cachedTenantId && cachedTenantUserId === user.id) {
    return cachedTenantId;
  }

  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenant_id,is_default,created_at')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!error && data?.tenant_id) {
    cachedTenantId = data.tenant_id;
    cachedTenantUserId = user.id;
    return cachedTenantId;
  }

  const { data: healedTenantId, error: healError } = await supabase
    .rpc('ensure_current_user_tenant_membership');

  if (!healError && healedTenantId) {
    cachedTenantId = healedTenantId;
    cachedTenantUserId = user.id;
    return cachedTenantId;
  }

  // Self-heal path: if membership row is missing, map user to default tenant.
  // This avoids circular dependency with employees RLS.
  const { data: defaultTenant, error: defaultTenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', 'default-company')
    .maybeSingle();

  if (defaultTenantError || !defaultTenant?.id) {
    return null;
  }

  const { error: insertError } = await supabase
    .from('user_tenants')
    .insert([
      {
        user_id: user.id,
        tenant_id: defaultTenant.id,
        membership_role: 'member',
        is_default: true,
      },
    ]);

  if (insertError) {
    return null;
  }

  cachedTenantId = defaultTenant.id;
  cachedTenantUserId = user.id;
  return cachedTenantId;
}

export function buildTenantStoragePath(
  tenantId: string,
  scope: string,
  fileName: string
): string {
  return `${tenantId}/${scope}/${fileName}`;
}
