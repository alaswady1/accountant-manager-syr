'use client';

import { useState, useEffect } from 'react';
import { Search, Mail, Phone, Plus, X, Users, Edit, Upload, FileText, Download, Trash2, TrendingUp, DollarSign } from 'lucide-react';
import { Customer } from '@/lib/types';
import { getCustomersPage } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { createSignedStorageUrl, extractStoragePath } from '@/lib/storage';
import { buildTenantStoragePath, getCurrentTenantId } from '@/lib/tenant';
import { useLanguage } from '@/lib/language-context';

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface CustomerFile {
  id: string;
  customer_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  notes: string | null;
}

export default function CustomersPage() {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [pageInput, setPageInput] = useState('1');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerFiles, setCustomerFiles] = useState<CustomerFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch customers from Supabase
  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(currentPage);
    }, 250);

    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user.email || 'Admin User');
    }

    const tenantId = await getCurrentTenantId();
    if (tenantId) {
      setCurrentTenantId(tenantId);
    }
  }

  async function fetchCustomers(page: number) {
    setLoading(true);
    const result = await getCustomersPage(page, pageSize, {
      search: searchTerm,
      segment: 'product_buyer',
    });
    setCustomers(result.data);
    setTotalCustomersCount(result.count);
    setLoading(false);
  }

  async function fetchCustomerFiles(customerId: string) {
    const { data, error } = await supabase
      .from('customer_files')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
      return [];
    }

    const resolvedFiles = await Promise.all((data || []).map(async (file) => {
      const signedUrl = await createSignedStorageUrl('customer-files', file.file_url);
      return {
        ...file,
        file_url: signedUrl || file.file_url,
      };
    }));

    return resolvedFiles;
  }

  async function openFilesModal(customer: Customer) {
    setSelectedCustomer(customer);
    const files = await fetchCustomerFiles(customer.id);
    setCustomerFiles(files);
    setShowFilesModal(true);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !e.target.files[0] || !selectedCustomer) return;

    const file = e.target.files[0];
    setUploadingFile(true);

    try {
      const tenantId = currentTenantId || await getCurrentTenantId(true);
      if (!tenantId) {
        throw new Error('No tenant membership found for current user');
      }

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const randomName = `${selectedCustomer.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const fileName = buildTenantStoragePath(tenantId, 'customers', randomName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('customer-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save file record to database
      const { data, error } = await supabase
        .from('customer_files')
        .insert([{
          tenant_id: tenantId,
          customer_id: selectedCustomer.id,
          file_name: file.name,
          file_url: fileName,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: currentUser,
        }])
        .select()
        .single();

      if (error) throw error;

      const signedUrl = await createSignedStorageUrl('customer-files', data.file_url);
      const displayRecord = {
        ...data,
        file_url: signedUrl || data.file_url,
      };

      // Update files list
      setCustomerFiles([displayRecord, ...customerFiles]);
      alert('File uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file: ' + error.message);
    }

    setUploadingFile(false);
    // Reset file input
    e.target.value = '';
  }

  async function handleDeleteFile(file: CustomerFile) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      // Extract file path from URL
      const filePath = extractStoragePath(file.file_url, 'customer-files');
      if (!filePath) throw new Error('Unable to determine file path');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('customer-files')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('customer_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;

      // Update files list
      setCustomerFiles(customerFiles.filter(f => f.id !== file.id));
      alert('File deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file: ' + error.message);
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const tenantId = currentTenantId || await getCurrentTenantId(true);
      if (!tenantId) {
        alert('No tenant membership found for current user.');
        setSubmitting(false);
        return;
      }

      // Validation: At least email OR phone required
      if (!formData.email && !formData.phone) {
        alert(t.customers.emailOrPhoneRequired);
        setSubmitting(false);
        return;
      }

      // Phone format validation removed to allow international formats

      // Use email or generate one from phone
      const emailForAuth = formData.email || `${formData.phone}@phone.local`;

      // Step 1: Create authentication account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailForAuth,
        password: formData.password,
        options: {
          emailRedirectTo: undefined,
        }
      });

      if (authError) {
        alert(t.customers.accountFailed + ': ' + authError.message);
        setSubmitting(false);
        return;
      }

      if (!authData.user) {
        alert(t.customers.accountFailed);
        setSubmitting(false);
        return;
      }

      // Step 2: Create customer record with the auth user's ID
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .insert([{
          id: authData.user.id,
          tenant_id: tenantId,
          customer_segment: 'product_buyer',
          name: formData.name,
          company: formData.company || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          total_orders: 0,
          total_spent: 0,
        }])
        .select()
        .single();

      if (customerError) {
        console.error('Error creating customer:', customerError);
        alert('Failed to create customer profile: ' + customerError.message);
        setSubmitting(false);
        return;
      }

      const { error: membershipError } = await supabase
        .from('user_tenants')
        .insert([{
          user_id: authData.user.id,
          tenant_id: tenantId,
          membership_role: 'member',
          is_default: true,
        }]);

      if (membershipError) {
        console.error('Error creating customer tenant membership:', membershipError);
      }

      // Success!
      alert(t.customers.accountCreated);
      setCustomers([customerData, ...customers]);
      setShowAddModal(false);
      resetForm();
      await fetchCustomers(currentPage);
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSubmitting(true);

    try {
      // Validation: Phone format if provided (optional - allow any format)
      // Remove strict validation to allow international formats

      // Update customer record
      const { data, error } = await supabase
        .from('customers')
        .update({
          name: formData.name,
          company: formData.company || null,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
        })
        .eq('id', selectedCustomer.id)
        .select()
        .single();

      if (error) {
        alert('Failed to update customer: ' + error.message);
        setSubmitting(false);
        return;
      }

      // Update customers list
      setCustomers(customers.map(c => c.id === data.id ? data : c));
      setShowEditModal(false);
      setSelectedCustomer(null);
      resetForm();
      alert('Customer updated successfully!');
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + error.message);
    }

    setSubmitting(false);
  }

  function openEditModal(customer: Customer) {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      company: customer.company || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      password: '', // Don't populate password for security
    });
    setShowEditModal(true);
  }

  function resetForm() {
    setFormData({
      name: '',
      company: '',
      email: '',
      phone: '',
      address: '',
      password: '',
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCustomersCount / pageSize));
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const pageStart = totalCustomersCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalCustomersCount);

  function handleGoToPage() {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }

    const safePage = Math.min(Math.max(1, parsed), totalPages);
    setCurrentPage(safePage);
    setPageInput(String(safePage));
  }

  const totalCustomers = totalCustomersCount;
  const totalSpent = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalOrders = customers.reduce((sum, c) => sum + c.total_orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen" style={{ backgroundColor: '#FDF8F8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#9333EA' }}></div>
          <p className="mt-4 text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6" style={{ backgroundColor: '#FDF8F8' }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: '#1F2937' }}>
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#9333EA' }}>
                <Users size={24} className="text-white" />
              </div>
              Customers
            </h1>
            <p className="mt-1 ml-0 sm:ml-16 text-sm" style={{ color: '#6B7280' }}>Manage your customer relationships</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-all shadow-md text-sm font-medium w-full sm:w-auto"
            style={{ backgroundColor: '#9333EA' }}
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Total Customers</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalCustomers}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F3E8FF' }}>
                <Users size={24} style={{ color: '#9333EA' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Revenue (Page)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                <TrendingUp size={24} style={{ color: '#10B981' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Orders (Page)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalOrders}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#E0F2FE' }}>
                <FileText size={24} style={{ color: '#0EA5E9' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Avg Order (Page)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${avgOrderValue.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#FEF3C7' }}>
                <DollarSign size={24} style={{ color: '#F59E0B' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search customers by name, company, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead style={{ backgroundColor: '#F9FAFB' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Orders</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Spent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Since</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                  {/* Customer Name/Company */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div>
                      {customer.company ? (
                        <>
                          <div className="text-sm font-semibold text-gray-900">{customer.company}</div>
                          <div className="text-xs text-gray-600">Contact: {customer.name}</div>
                        </>
                      ) : (
                        <div className="text-sm font-semibold text-gray-900">{customer.name}</div>
                      )}
                    </div>
                  </td>

                  {/* Contact Info */}
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5 text-gray-700 mb-1">
                        <Mail size={14} className="text-gray-400" />
                        <span className="text-xs">{customer.email}</span>
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Phone size={14} className="text-gray-400" />
                          <span className="text-xs">{customer.phone}</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Orders */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{customer.total_orders}</div>
                  </td>

                  {/* Total Spent */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold" style={{ color: '#10B981' }}>
                      ${customer.total_spent.toFixed(2)}
                    </div>
                  </td>

                  {/* Since */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-xs text-gray-600">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openFilesModal(customer)}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-50"
                        style={{ color: '#0EA5E9' }}
                        title="Files"
                      >
                        <FileText size={18} />
                      </button>
                      <button
                        onClick={() => openEditModal(customer)}
                        className="p-2 rounded-lg transition-colors hover:bg-purple-50"
                        style={{ color: '#9333EA' }}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {customers.length === 0 && (
          <div className="text-center py-12">
            <Users size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No customers found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search</p>
          </div>
        )}

        <div className="border-t border-gray-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-600">
            Showing {pageStart}-{pageEnd} of {totalCustomersCount} customers
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number.parseInt(e.target.value, 10) || PAGE_SIZE)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={!canPrev}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <span className="sm:hidden">|&lt;</span>
              <span className="hidden sm:inline">First</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={!canPrev}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700 min-w-[90px] text-center">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={!canNext}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={!canNext}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <span className="sm:hidden">&gt;|</span>
              <span className="hidden sm:inline">Last</span>
            </button>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGoToPage();
                }
              }}
              className="w-20 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
              aria-label="Go to page"
            />
            <button
              type="button"
              onClick={handleGoToPage}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              Go
            </button>
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#9333EA' }}>
                  <Users size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>Add New Customer</h2>
              </div>
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddCustomer}>
              {/* Form Content */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Contact Person */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                      placeholder="e.g., Ahmad Hassan"
                    />
                  </div>

                  {/* Company Name */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customers.companyName}
                    </label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                      placeholder={t.customers.companyPlaceholder}
                    />
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customers.emailAddress}
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                      placeholder="ahmad@example.com"
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customers.phoneNumber}
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                      placeholder="+963 XX XXX XXXX"
                    />
                  </div>

                  {/* Password */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customers.password} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                      placeholder={t.customers.passwordPlaceholder}
                    />
                    <p className="text-xs text-gray-500 mt-1">{t.customers.passwordHelper}</p>
                  </div>

                  {/* Shipping Address - Full Width */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.customers.shippingAddress}
                    </label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent resize-none text-sm"
                      rows={2}
                      placeholder="Damascus, Syria"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="px-6 py-4 border-t border-gray-200 bg-white">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    disabled={submitting}
                    className="flex-1 px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 transition-all text-sm"
                  >
                    {t.customers.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm hover:opacity-90"
                    style={{ backgroundColor: '#9333EA' }}
                  >
                    {submitting ? t.customers.adding : t.customers.save}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#0EA5E9' }}>
                  <Edit size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>Edit Customer</h2>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setSelectedCustomer(null); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer}>
              {/* Form Content */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Contact Person */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                      placeholder="e.g., Ahmad Hassan"
                    />
                  </div>

                  {/* Company Name */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                      placeholder="Optional"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                      placeholder="email@example.com"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                      placeholder="09XXXXXXXX"
                    />
                  </div>

                  {/* Address */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent resize-none"
                      rows={3}
                      placeholder="Enter address"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="px-6 py-4 border-t border-gray-200 bg-white">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setSelectedCustomer(null); resetForm(); }}
                    disabled={submitting}
                    className="flex-1 px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm hover:opacity-90"
                    style={{ backgroundColor: '#01113B' }}
                  >
                    {submitting ? 'Saving...' : 'Update Customer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Files Management Modal */}
      {showFilesModal && selectedCustomer && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#0EA5E9' }}>
                  <FileText size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>Customer Files</h2>
                  <p className="text-sm text-gray-600">
                    {selectedCustomer.company || selectedCustomer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowFilesModal(false); setSelectedCustomer(null); setCustomerFiles([]); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {/* Upload Section */}
              <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <label className="flex flex-col items-center justify-center cursor-pointer">
                  <Upload size={32} className="text-gray-400 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Upload New File</span>
                  <span className="text-xs text-gray-500 mt-1">PDF, DOC, DOCX, JPG, PNG (Max 10MB)</span>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  />
                </label>
                {uploadingFile && (
                  <p className="text-center text-sm text-blue-600 mt-2">Uploading...</p>
                )}
              </div>

              {/* Files List */}
              {customerFiles.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files ({customerFiles.length})</h3>
                  {customerFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-blue-50">
                          <FileText size={20} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.file_name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-gray-500">
                              {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(file.created_at).toLocaleDateString()}
                            </p>
                            {file.uploaded_by && (
                              <p className="text-xs text-gray-500">by {file.uploaded_by}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg transition-colors hover:bg-blue-50"
                          style={{ color: '#0EA5E9' }}
                          title="Download File"
                        >
                          <Download size={18} />
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="p-2 rounded-lg transition-colors hover:bg-red-50"
                          style={{ color: '#EF4444' }}
                          title="Delete File"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText size={48} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No files uploaded yet</p>
                  <p className="text-sm text-gray-400 mt-1">Upload documents, contracts, or other files</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
              <button
                onClick={() => { setShowFilesModal(false); setSelectedCustomer(null); setCustomerFiles([]); }}
                className="w-full px-6 py-2.5 rounded-lg font-medium transition-all text-sm text-white hover:opacity-90"
                style={{ backgroundColor: '#01113B' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
