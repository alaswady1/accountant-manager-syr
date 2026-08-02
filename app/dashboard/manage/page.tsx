'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  Shield,
  UserCog,
  UserPlus,
  Activity,
  Search,
  Edit,
  Eye,
  Download,
  RefreshCcw,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentTenantId } from '@/lib/tenant';
import { isCurrentUserSystemAdmin } from '@/lib/system-admin';
import { EmployeeRole } from '@/lib/types';

type MembershipRole = 'owner' | 'admin' | 'member';

interface TenantMembership {
  user_id: string;
  tenant_id: string;
  membership_role: MembershipRole;
  is_default: boolean;
}

interface EmployeeLite {
  id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  is_active: boolean;
}

interface CustomerLite {
  id: string;
  name: string;
  email: string | null;
  customer_segment: 'product_buyer' | 'service_client';
  created_at: string;
}

interface ManageMemberRow {
  userId: string;
  name: string;
  email: string;
  entityType: 'employee' | 'customer' | 'client';
  membershipRole: MembershipRole;
  employeeRole: EmployeeRole | null;
  isActive: boolean;
}

interface ActivityRow {
  id: string;
  entity_table: string;
  action: string;
  actor_user_id: string | null;
  record_id: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  created_at: string;
}

const employeeRoles: EmployeeRole[] = ['admin', 'manager', 'accountant', 'warehouse', 'sales', 'driver', 'employee'];
const membershipRoles: MembershipRole[] = ['owner', 'admin', 'member'];
const auditEntityOptions = ['all', 'customers', 'employees', 'expenses', 'income', 'invoices', 'payments', 'orders', 'products', 'suppliers', 'user_tenants'];
const ACTIVITY_PAGE_SIZE = 100;

export default function ManagePage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [members, setMembers] = useState<ManageMemberRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [showActivityDiffModal, setShowActivityDiffModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRow | null>(null);
  const [search, setSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityActionFilter, setActivityActionFilter] = useState<'all' | 'CREATE' | 'UPDATE' | 'DELETE'>('all');
  const [activityEntityFilter, setActivityEntityFilter] = useState('all');
  const [activityFromDate, setActivityFromDate] = useState('');
  const [activityToDate, setActivityToDate] = useState('');

  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    password: '',
  });
  const [editClientForm, setEditClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
  });

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!isSystemAdmin || !tenantId) return;
    fetchActivityLogs(tenantId, true);
  }, [isSystemAdmin, tenantId, activityActionFilter, activityEntityFilter, activityFromDate, activityToDate]);

  async function init() {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      return;
    }

    const resolvedTenant = await getCurrentTenantId(true);
    if (!resolvedTenant) {
      setLoading(false);
      return;
    }

    setTenantId(resolvedTenant);

    const canManage = await isCurrentUserSystemAdmin();
    setIsSystemAdmin(canManage);

    if (!canManage) {
      setLoading(false);
      return;
    }

    await Promise.all([fetchMembers(resolvedTenant), fetchClients(resolvedTenant), fetchActivityLogs(resolvedTenant, true)]);
    setLoading(false);
  }

  async function fetchClients(currentTenantId: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id,name,email,phone,company,address,created_at')
      .eq('tenant_id', currentTenantId)
      .eq('customer_segment', 'service_client')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Manage clients fetch failed:', error);
      return;
    }

    setClients((data || []) as ClientRow[]);
  }

  async function fetchMembers(currentTenantId: string) {
    const [membershipRes, employeesRes, customersRes] = await Promise.all([
      supabase
        .from('user_tenants')
        .select('user_id,tenant_id,membership_role,is_default')
        .eq('tenant_id', currentTenantId),
      supabase
        .from('employees')
        .select('id,name,email,role,is_active')
        .eq('tenant_id', currentTenantId),
      supabase
        .from('customers')
        .select('id,name,email,customer_segment,created_at')
        .eq('tenant_id', currentTenantId),
    ]);

    if (membershipRes.error || employeesRes.error || customersRes.error) {
      console.error('Manage members fetch failed:', {
        membershipError: membershipRes.error,
        employeesError: employeesRes.error,
        customersError: customersRes.error,
      });
      return;
    }

    const employeeMap = new Map((employeesRes.data || []).map((e: EmployeeLite) => [e.id, e]));
    const customerMap = new Map((customersRes.data || []).map((c: CustomerLite) => [c.id, c]));

    const rows: ManageMemberRow[] = (membershipRes.data || []).map((m: TenantMembership) => {
      const employee = employeeMap.get(m.user_id);
      const customer = customerMap.get(m.user_id);

      if (employee) {
        return {
          userId: m.user_id,
          name: employee.name,
          email: employee.email,
          entityType: 'employee',
          membershipRole: m.membership_role,
          employeeRole: employee.role,
          isActive: employee.is_active,
        };
      }

      if (customer) {
        return {
          userId: m.user_id,
          name: customer.name,
          email: customer.email || 'no-email',
          entityType: customer.customer_segment === 'service_client' ? 'client' : 'customer',
          membershipRole: m.membership_role,
          employeeRole: null,
          isActive: true,
        };
      }

      return {
        userId: m.user_id,
        name: 'Unknown user',
        email: 'unknown',
        entityType: 'customer',
        membershipRole: m.membership_role,
        employeeRole: null,
        isActive: true,
      };
    });

    setMembers(rows);
  }

  async function fetchActivityLogs(currentTenantId: string, reset = false) {
    setActivityLoading(true);

    const from = reset ? 0 : activityOffset;
    const to = from + ACTIVITY_PAGE_SIZE - 1;

    let query = supabase
      .from('audit_logs')
      .select('id,entity_table,action,actor_user_id,record_id,old_data,new_data,created_at')
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (activityActionFilter !== 'all') {
      query = query.eq('action', activityActionFilter);
    }

    if (activityEntityFilter !== 'all') {
      query = query.eq('entity_table', activityEntityFilter);
    }

    if (activityFromDate) {
      query = query.gte('created_at', `${activityFromDate}T00:00:00`);
    }

    if (activityToDate) {
      query = query.lte('created_at', `${activityToDate}T23:59:59.999`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Manage audit logs fetch failed:', error);
      if (reset) setActivities([]);
      setActivityLoading(false);
      return;
    }

    const rows = (data || []) as ActivityRow[];

    if (reset) {
      setActivities(rows);
      setActivityOffset(rows.length);
    } else {
      setActivities((prev) => {
        const existingIds = new Set(prev.map((row) => row.id));
        const merged = [...prev, ...rows.filter((row) => !existingIds.has(row.id))];
        return merged;
      });
      setActivityOffset((prev) => prev + rows.length);
    }

    setActivityHasMore(rows.length === ACTIVITY_PAGE_SIZE);
    setActivityLoading(false);
  }

  async function changeMembershipRole(userId: string, role: MembershipRole) {
    if (!tenantId) return;

    const { error } = await supabase
      .from('user_tenants')
      .update({ membership_role: role })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (error) {
      alert('Failed to update membership role: ' + error.message);
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, membershipRole: role } : m))
    );

    await fetchActivityLogs(tenantId, true);
  }

  async function changeEmployeeRole(userId: string, role: EmployeeRole) {
    const { error } = await supabase
      .from('employees')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      alert('Failed to update employee role: ' + error.message);
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, employeeRole: role } : m))
    );

    await fetchActivityLogs(tenantId, true);
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;

    setSubmitting(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newClientForm.email,
        password: newClientForm.password,
      });

      if (authError || !authData.user) {
        alert('Failed to create client account: ' + (authError?.message || 'no user returned'));
        setSubmitting(false);
        return;
      }

      const clientUserId = authData.user.id;

      const { error: customerError } = await supabase
        .from('customers')
        .insert([
          {
            id: clientUserId,
            tenant_id: tenantId,
            customer_segment: 'service_client',
            name: newClientForm.name,
            company: newClientForm.company || null,
            email: newClientForm.email,
            phone: newClientForm.phone || null,
            address: newClientForm.address || null,
            total_orders: 0,
            total_spent: 0,
          },
        ]);

      if (customerError) {
        alert('Client profile creation failed: ' + customerError.message);
        setSubmitting(false);
        return;
      }

      const { error: membershipError } = await supabase
        .from('user_tenants')
        .insert([
          {
            user_id: clientUserId,
            tenant_id: tenantId,
            membership_role: 'member',
            is_default: true,
          },
        ]);

      if (membershipError) {
        alert('Client membership creation failed: ' + membershipError.message);
        setSubmitting(false);
        return;
      }

      setShowAddClientModal(false);
      setNewClientForm({ name: '', email: '', phone: '', company: '', address: '', password: '' });
      await fetchMembers(tenantId);
      await fetchClients(tenantId);
      await fetchActivityLogs(tenantId, true);
      alert('Client added successfully.');
    } catch (error: any) {
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      m.entityType.toLowerCase().includes(term)
    );
  }, [members, search]);

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients;

    return clients.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.company || '').toLowerCase().includes(term)
    );
  }, [clients, clientSearch]);

  const memberMapById = useMemo(() => {
    return new Map(members.map((member) => [member.userId, member]));
  }, [members]);

  function getActorLabel(actorUserId: string | null): string {
    if (!actorUserId) return 'system';

    const matched = memberMapById.get(actorUserId);
    if (!matched) return actorUserId;
    return `${matched.name} (${matched.email})`;
  }

  const filteredActivities = useMemo(() => {
    const term = activitySearch.trim().toLowerCase();
    if (!term) return activities;

    return activities.filter((item) => {
      const actorLabel = getActorLabel(item.actor_user_id).toLowerCase();
      return (
        item.action.toLowerCase().includes(term) ||
        item.entity_table.toLowerCase().includes(term) ||
        (item.record_id || '').toLowerCase().includes(term) ||
        actorLabel.includes(term)
      );
    });
  }, [activities, activitySearch, memberMapById]);

  function openActivityDetails(activity: ActivityRow) {
    setSelectedActivity(activity);
    setShowActivityDiffModal(true);
  }

  function getChangedKeys(activity: ActivityRow): string[] {
    if (activity.action !== 'UPDATE') return [];
    const oldObj = activity.old_data || {};
    const newObj = activity.new_data || {};
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    return Array.from(keys).filter((key) => {
      const oldVal = JSON.stringify(oldObj[key]);
      const newVal = JSON.stringify(newObj[key]);
      return oldVal !== newVal;
    });
  }

  function toCsvValue(value: unknown): string {
    const text = String(value ?? '');
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  function handleExportActivityCsv() {
    if (filteredActivities.length === 0) {
      alert('No activity rows to export.');
      return;
    }

    const header = ['created_at', 'action', 'entity_table', 'actor', 'record_id'];
    const rows = filteredActivities.map((item) => [
      item.created_at,
      item.action,
      item.entity_table,
      getActorLabel(item.actor_user_id),
      item.record_id || '',
    ]);

    const csv = [header, ...rows].map((row) => row.map((cell) => toCsvValue(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `system-activity-${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function openEditClientModal(client: ClientRow) {
    setSelectedClient(client);
    setEditClientForm({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      company: client.company || '',
      address: client.address || '',
    });
    setShowEditClientModal(true);
  }

  async function handleUpdateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) return;

    setSubmitting(true);

    const { error } = await supabase
      .from('customers')
      .update({
        name: editClientForm.name,
        email: editClientForm.email || null,
        phone: editClientForm.phone || null,
        company: editClientForm.company || null,
        address: editClientForm.address || null,
      })
      .eq('id', selectedClient.id)
      .eq('tenant_id', tenantId);

    if (error) {
      alert('Failed to update client: ' + error.message);
      setSubmitting(false);
      return;
    }

    setShowEditClientModal(false);
    setSelectedClient(null);
    await fetchClients(tenantId);
    alert('Client updated successfully.');
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen" style={{ backgroundColor: '#FDF8F8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin control panel...</p>
        </div>
      </div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="p-6" style={{ backgroundColor: '#FDF8F8', minHeight: '100vh' }}>
        <div className="max-w-xl bg-white border border-red-100 rounded-xl p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Manage</h1>
          <p className="text-red-600 font-medium">Access denied. Only system admins can open this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6" style={{ backgroundColor: '#FDF8F8', minHeight: '100vh' }}>
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: '#1F2937' }}>
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#0F172A' }}>
                <Settings size={24} className="text-white" />
              </div>
              Admin Control Panel
            </h1>
            <p className="mt-1 ml-0 sm:ml-16 text-sm" style={{ color: '#6B7280' }}>
              Manage memberships, roles, and monitor recent system movement.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or type..."
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Shield size={16} className="text-slate-700" />
            <h2 className="font-semibold text-gray-900">Membership & Role Management</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ backgroundColor: '#F9FAFB' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Tenant Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Employee Role</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredMembers.map((member) => (
                  <tr key={member.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{member.name}</div>
                      <div className="text-xs text-gray-500">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 capitalize">{member.entityType}</td>
                    <td className="px-4 py-3">
                      <select
                        value={member.membershipRole}
                        onChange={(e) => changeMembershipRole(member.userId, e.target.value as MembershipRole)}
                        className="px-2 py-1 rounded-md border border-gray-200 text-sm"
                      >
                        {membershipRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {member.employeeRole ? (
                        <select
                          value={member.employeeRole}
                          onChange={(e) => changeEmployeeRole(member.userId, e.target.value as EmployeeRole)}
                          className="px-2 py-1 rounded-md border border-gray-200 text-sm"
                        >
                          {employeeRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">Not employee</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Activity size={16} className="text-slate-700" />
            <h2 className="font-semibold text-gray-900">System Activity Log</h2>
          </div>

          <div className="p-3 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
            <input
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search actor, table, action, or record id..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                value={activityActionFilter}
                onChange={(e) => setActivityActionFilter(e.target.value as 'all' | 'CREATE' | 'UPDATE' | 'DELETE')}
                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
              >
                <option value="all">All actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
              </select>

              <select
                value={activityEntityFilter}
                onChange={(e) => setActivityEntityFilter(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
              >
                {auditEntityOptions.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity === 'all' ? 'All tables' : entity}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={activityFromDate}
                onChange={(e) => setActivityFromDate(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
                title="From date"
              />
              <input
                type="date"
                value={activityToDate}
                onChange={(e) => setActivityToDate(e.target.value)}
                className="px-2 py-2 border border-gray-200 rounded-lg text-xs"
                title="To date"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setActivitySearch('');
                setActivityActionFilter('all');
                setActivityEntityFilter('all');
                setActivityFromDate('');
                setActivityToDate('');
              }}
              className="px-2 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Reset filters
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fetchActivityLogs(tenantId, true)}
                className="px-2 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center justify-center gap-1"
              >
                <RefreshCcw size={12} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExportActivityCsv}
                className="px-2 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center justify-center gap-1"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          </div>

          <div className="max-h-[550px] overflow-y-auto">
            {activityLoading ? (
              <div className="p-4 text-sm text-gray-500">Loading activity logs...</div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No activity found.</div>
            ) : (
              filteredActivities.map((item) => (
                <div key={item.id} className="p-4 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <UserCog size={12} className="text-gray-500" />
                    <span className="text-xs font-semibold text-gray-800">{item.action} on {item.entity_table}</span>
                  </div>
                  <div className="text-xs text-gray-600">By: {getActorLabel(item.actor_user_id)}</div>
                  <div className="text-xs text-gray-600">Record id: {item.record_id || 'n/a'}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{new Date(item.created_at).toLocaleString()}</div>
                  <button
                    type="button"
                    onClick={() => openActivityDetails(item)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900"
                  >
                    <Eye size={12} />
                    View details
                  </button>
                </div>
              ))
            )}

            {!activityLoading && activityHasMore ? (
              <div className="p-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => fetchActivityLogs(tenantId, false)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Load older logs
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-slate-700" />
            <h2 className="font-semibold text-gray-900">Clients Management</h2>
          </div>
          <button
            onClick={() => setShowAddClientModal(true)}
            className="flex items-center justify-center gap-2 text-white px-3 py-2 rounded-lg hover:opacity-90 transition-all text-sm font-medium"
            style={{ backgroundColor: '#0F172A' }}
          >
            <UserPlus size={14} />
            Add Client
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients by name, email, or company..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#F9FAFB' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{client.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.email || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.phone || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.company || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEditClientModal(client)}
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                      title="Edit Client"
                    >
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Client Account (Admin)</h2>
              <button onClick={() => setShowAddClientModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              <input required value={newClientForm.name} onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })} placeholder="Client name" className="w-full px-4 py-3 border rounded-lg" />
              <input required type="email" value={newClientForm.email} onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })} placeholder="Client email" className="w-full px-4 py-3 border rounded-lg" />
              <input required type="password" value={newClientForm.password} onChange={(e) => setNewClientForm({ ...newClientForm, password: e.target.value })} placeholder="Client account password" className="w-full px-4 py-3 border rounded-lg" />
              <input value={newClientForm.phone} onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })} placeholder="Phone" className="w-full px-4 py-3 border rounded-lg" />
              <input value={newClientForm.company} onChange={(e) => setNewClientForm({ ...newClientForm, company: e.target.value })} placeholder="Company" className="w-full px-4 py-3 border rounded-lg" />
              <input value={newClientForm.address} onChange={(e) => setNewClientForm({ ...newClientForm, address: e.target.value })} placeholder="Address" className="w-full px-4 py-3 border rounded-lg" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddClientModal(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-white bg-slate-900">
                  {submitting ? 'Adding...' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditClientModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Client</h2>
              <button onClick={() => setShowEditClientModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleUpdateClient} className="p-6 space-y-4">
              <input required value={editClientForm.name} onChange={(e) => setEditClientForm({ ...editClientForm, name: e.target.value })} placeholder="Client name" className="w-full px-4 py-3 border rounded-lg" />
              <input value={editClientForm.company} onChange={(e) => setEditClientForm({ ...editClientForm, company: e.target.value })} placeholder="Company" className="w-full px-4 py-3 border rounded-lg" />
              <input value={editClientForm.email} onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })} placeholder="Email" className="w-full px-4 py-3 border rounded-lg" />
              <input value={editClientForm.phone} onChange={(e) => setEditClientForm({ ...editClientForm, phone: e.target.value })} placeholder="Phone" className="w-full px-4 py-3 border rounded-lg" />
              <input value={editClientForm.address} onChange={(e) => setEditClientForm({ ...editClientForm, address: e.target.value })} placeholder="Address" className="w-full px-4 py-3 border rounded-lg" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowEditClientModal(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-white bg-slate-900">
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showActivityDiffModal && selectedActivity ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Activity Details</h2>
              <button onClick={() => setShowActivityDiffModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                <div><strong>Action:</strong> {selectedActivity.action}</div>
                <div><strong>Table:</strong> {selectedActivity.entity_table}</div>
                <div><strong>Actor:</strong> {getActorLabel(selectedActivity.actor_user_id)}</div>
                <div><strong>Record ID:</strong> {selectedActivity.record_id || 'n/a'}</div>
                <div className="md:col-span-2"><strong>At:</strong> {new Date(selectedActivity.created_at).toLocaleString()}</div>
              </div>

              {selectedActivity.action === 'UPDATE' ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Changed fields: {getChangedKeys(selectedActivity).join(', ') || 'none detected'}
                </div>
              ) : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-sm mb-2">Old Data</h3>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-[360px]">
{JSON.stringify(selectedActivity.old_data, null, 2)}
                  </pre>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-2">New Data</h3>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-[360px]">
{JSON.stringify(selectedActivity.new_data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
