import { supabase } from './supabase';

export async function isCurrentUserSystemAdmin(): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return false;
  }

  const { data: row, error: rowError } = await supabase
    .from('system_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (rowError) {
    return false;
  }

  return !!row;
}
