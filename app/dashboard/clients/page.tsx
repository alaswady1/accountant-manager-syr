'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit, X, Users } from 'lucide-react';
import { Customer } from '@/lib/types';
import { getCustomersPage } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { getCurrentTenantId } from '@/lib/tenant';

const PAGE_SIZE = 25;

export default function ClientsPage() {
  const [clients, setClients] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients(currentPage);
    }, 250);

    return () => clearTimeout(timer);
  }, [currentPage, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  async function fetchClients(page: number) {
    setLoading(true);
    const result = await getCustomersPage(page, PAGE_SIZE, {
      search: searchTerm,
      segment: 'service_client',
    });
    setClients(result.data);
    setTotalCount(result.count);
    setLoading(false);
  }

  function resetForm() {
    setFormData({
      name: '',
      company: '',
      email: '',
      phone: '',
      address: '',
    });
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const currentTenant = await getCurrentTenantId(true);
      if (!currentTenant) {
        alert(`No tenant membership found for current user (${user?.email || 'unknown'}).`);
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from('customers')
        .insert([
          {
            tenant_id: currentTenant,
            customer_segment: 'service_client',
            name: formData.name,
            company: formData.company || null,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
            total_orders: 0,
            total_spent: 0,
          },
        ])
        .select()
        .single();

      if (error) {
        alert('Failed to add client: ' + error.message);
      } else if (data) {
        setClients([data, ...clients]);
        setShowAddModal(false);
        resetForm();
        fetchClients(currentPage);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  async function handleUpdateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from('customers')
      .update({
        name: formData.name,
        company: formData.company || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
      })
      .eq('id', selectedClient.id)
      .select()
      .single();

    if (error) {
      alert('Failed to update client: ' + error.message);
    } else if (data) {
      setClients(clients.map((c) => (c.id === data.id ? data : c)));
      setShowEditModal(false);
      setSelectedClient(null);
      resetForm();
    }

    setSubmitting(false);
  }

  function openEditModal(client: Customer) {
    setSelectedClient(client);
    setFormData({
      name: client.name,
      company: client.company || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
    });
    setShowEditModal(true);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen" style={{ backgroundColor: '#FDF8F8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clients...</p>
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
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#2563EB' }}>
                <Users size={24} className="text-white" />
              </div>
              Clients
            </h1>
            <p className="mt-1 ml-0 sm:ml-16 text-sm" style={{ color: '#6B7280' }}>
              Manage non-product clients separately from product buyers
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-all shadow-md text-sm font-medium w-full sm:w-auto"
            style={{ backgroundColor: '#2563EB' }}
          >
            <Plus size={20} />
            Add Client
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search clients by name, company, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#F9FAFB' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">{client.name}</div>
                    {client.company ? <div className="text-xs text-gray-500">{client.company}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.email || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{client.phone || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEditModal(client)}
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
        <div className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
          Showing {clients.length} of {totalCount} clients
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Client</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Client name" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Company" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Phone" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Address" className="w-full px-4 py-3 border rounded-lg" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-white bg-blue-600">
                  {submitting ? 'Adding...' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Client</h2>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleUpdateClient} className="p-6 space-y-4">
              <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Client name" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Company" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Phone" className="w-full px-4 py-3 border rounded-lg" />
              <input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Address" className="w-full px-4 py-3 border rounded-lg" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-white bg-blue-600">
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
