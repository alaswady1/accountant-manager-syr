'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, TrendingUp, DollarSign, Calendar, Tag, User, FileText, Filter, CreditCard, Wallet, BarChart3 } from 'lucide-react';
import { Income, Customer, Employee } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { createSignedStorageUrl, extractStoragePath } from '@/lib/storage';
import { buildTenantStoragePath, getCurrentTenantId } from '@/lib/tenant';
import { useLanguage } from '@/lib/language-context';

export default function IncomePage() {
  const { t } = useLanguage();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all');
  const [filterSourceType, setFilterSourceType] = useState<'all' | 'invoice_payment' | 'manual'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [currentTenantId, setCurrentTenantId] = useState<string>('');

  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  
  const [formData, setFormData] = useState<{
    category: string;
    description: string;
    amount_usd: string;
    amount_syp: string;
    date: string;
    payment_method: string;
    received_by: string;
    customer_name: string;
    company_name: string;
    invoice_number: string;
    notes: string;
    invoice_file: File | null;
  }>({
    category: '',
    description: '',
    amount_usd: '',
    amount_syp: '',
    date: new Date().toISOString().split('T')[0],
    payment_method: '',
    received_by: '',
    customer_name: '',
    company_name: '',
    invoice_number: '',
    notes: '',
    invoice_file: null,
  });

  const categories = [
    { id: 'productSales', name: t.income.productSales },
    { id: 'serviceRevenue', name: t.income.serviceRevenue },
    { id: 'consulting', name: t.income.consulting },
    { id: 'rental', name: t.income.rental },
    { id: 'investment', name: t.income.investment },
    { id: 'commission', name: t.income.commission },
    { id: 'other', name: t.income.other },
  ];

  const paymentMethods = [
    { id: 'cash', name: t.income.cash },
    { id: 'card', name: t.income.card },
    { id: 'bank', name: t.income.bank },
  ];

  useEffect(() => {
    fetchIncomes();
    fetchCurrentUser();
    fetchCustomers();
    fetchEmployees();
  }, []);

  async function fetchCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error('Error getting user:', error);
      console.error('⚠️ You are NOT logged in!');
      console.error('Please login at: http://localhost:3001/login');
    } else if (user) {
      console.log('✅ Logged in as:', user.email);
      setCurrentUser(user.email || 'Admin User');

      const tenantId = await getCurrentTenantId();
      if (tenantId) {
        setCurrentTenantId(tenantId);
      }
    } else {
      console.error('⚠️ No user found - you need to login!');
    }
  }

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching customers:', error);
    } else if (data) {
      setCustomers(data);
    }
  }

  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching employees:', error);
    } else if (data) {
      setEmployees(data);
    }
  }

  async function fetchIncomes() {
    setLoading(true);
    const { data, error } = await supabase
      .from('income')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching income:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('⚠️  INCOME TABLE NOT FOUND!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
        console.error('📋 TO FIX:');
        console.error('1. Go to: https://supabase.com');
        console.error('2. Open your project');
        console.error('3. Click "SQL Editor"');
        console.error('4. Copy the SQL from: create-income-table.sql');
        console.error('5. Paste and RUN it');
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    } else if (data) {
      const resolvedIncomes = await Promise.all(data.map(async (income) => {
        if (!income.invoice_image_url) return income;

        const signedUrl = await createSignedStorageUrl('income-invoices', income.invoice_image_url);
        return {
          ...income,
          invoice_image_url: signedUrl || income.invoice_image_url,
        };
      }));

      setIncomes(resolvedIncomes);
    }
    setLoading(false);
  }

  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const tenantId = currentTenantId || await getCurrentTenantId(true);
    if (!tenantId) {
      alert('No tenant membership found for current user.');
      setSubmitting(false);
      return;
    }

    console.log('Adding income with data:', formData);
    console.log('Current user:', currentUser);

    let invoiceImageUrl = null;

    // Upload invoice file if provided
    if (formData.invoice_file) {
      const fileExt = formData.invoice_file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = buildTenantStoragePath(tenantId, 'invoices', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('income-invoices')
        .upload(filePath, formData.invoice_file);

      if (uploadError) {
        console.error('Error uploading invoice:', uploadError);
        console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
        console.error('Bucket name:', 'income-invoices');
        console.error('File path:', filePath);
        console.error('File name:', formData.invoice_file.name);
        console.error('File size:', formData.invoice_file.size);
        console.error('File type:', formData.invoice_file.type);
        alert(`Failed to upload invoice image\n\nError: ${uploadError.message}\n\nCheck browser console for details.`);
        setSubmitting(false);
        return;
      }

      invoiceImageUrl = filePath;
    }

    const amountUsd = parseFloat(formData.amount_usd || '0');
    const amountSyp = parseFloat(formData.amount_syp || '0');

    const { data, error } = await supabase
      .from('income')
      .insert([{
        tenant_id: tenantId,
        category: formData.category,
        description: formData.description,
        amount: amountUsd,
        amount_usd: amountUsd,
        amount_syp: amountSyp,
        date: formData.date,
        payment_method: formData.payment_method || null,
        customer_name: formData.customer_name || null,
        company_name: formData.company_name || null,
        invoice_number: formData.invoice_number || null,
        invoice_image_url: invoiceImageUrl,
        notes: formData.notes || null,
        added_by: formData.received_by || currentUser,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding income:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error hint:', error.hint);
      alert(`Failed to add income: ${error.message}\n\nCheck console for details.`);
    } else if (data) {
      console.log('Income added successfully:', data);
      const signedUrl = data.invoice_image_url
        ? await createSignedStorageUrl('income-invoices', data.invoice_image_url)
        : null;

      setIncomes([{ ...data, invoice_image_url: signedUrl || data.invoice_image_url }, ...incomes]);
      setShowAddModal(false);
      resetForm();
      alert(t.income.addSuccess);
    }

    setSubmitting(false);
  }

  async function handleUpdateIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIncome) return;
    setSubmitting(true);

    const tenantId = currentTenantId || await getCurrentTenantId(true);
    if (!tenantId) {
      alert('No tenant membership found for current user.');
      setSubmitting(false);
      return;
    }

    let invoiceImageUrl = extractStoragePath(selectedIncome.invoice_image_url || '', 'income-invoices');

    // Upload new invoice file if provided
    if (formData.invoice_file) {
      const fileExt = formData.invoice_file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = buildTenantStoragePath(tenantId, 'invoices', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('income-invoices')
        .upload(filePath, formData.invoice_file);

      if (uploadError) {
        console.error('Error uploading invoice:', uploadError);
        console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
        console.error('Bucket name:', 'income-invoices');
        console.error('File path:', filePath);
        alert(`Failed to upload invoice image\n\nError: ${uploadError.message}\n\nCheck browser console for details.`);
        setSubmitting(false);
        return;
      }

      invoiceImageUrl = filePath;
    }

    const amountUsd = parseFloat(formData.amount_usd || '0');
    const amountSyp = parseFloat(formData.amount_syp || '0');

    const { data, error } = await supabase
      .from('income')
      .update({
        category: formData.category,
        description: formData.description,
        amount: amountUsd,
        amount_usd: amountUsd,
        amount_syp: amountSyp,
        date: formData.date,
        payment_method: formData.payment_method || null,
        customer_name: formData.customer_name || null,
        company_name: formData.company_name || null,
        invoice_number: formData.invoice_number || null,
        invoice_image_url: invoiceImageUrl,
        notes: formData.notes || null,
        added_by: formData.received_by || currentUser,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedIncome.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating income:', error);
      alert('Failed to update income');
    } else if (data) {
      const signedUrl = data.invoice_image_url
        ? await createSignedStorageUrl('income-invoices', data.invoice_image_url)
        : null;

      setIncomes(incomes.map(i => i.id === data.id ? {
        ...data,
        invoice_image_url: signedUrl || data.invoice_image_url,
      } : i));
      setShowEditModal(false);
      setSelectedIncome(null);
      resetForm();
      alert(t.income.updateSuccess);
    }

    setSubmitting(false);
  }

  async function handleDeleteIncome(income: Income) {
    if (!confirm(t.income.confirmDelete)) return;

    const { error } = await supabase
      .from('income')
      .delete()
      .eq('id', income.id);

    if (error) {
      console.error('Error deleting income:', error);
      alert('Failed to delete income');
    } else {
      setIncomes(incomes.filter(i => i.id !== income.id));
      alert(t.income.deleteSuccess);
    }
  }

  function openEditModal(income: Income) {
    setSelectedIncome(income);
    setFormData({
      category: income.category,
      description: income.description,
      amount_usd: (income.amount_usd ?? income.amount)?.toString() || '',
      amount_syp: income.amount_syp?.toString() || '',
      date: income.date,
      payment_method: income.payment_method || '',
      received_by: income.added_by || '',
      customer_name: income.customer_name || '',
      company_name: income.company_name || '',
      invoice_number: income.invoice_number || '',
      notes: income.notes || '',
      invoice_file: null,
    });
    setShowEditModal(true);
  }

  function resetForm() {
    setFormData({
      category: '',
      description: '',
      amount_usd: '',
      amount_syp: '',
      date: new Date().toISOString().split('T')[0],
      payment_method: '',
      received_by: '',
      customer_name: '',
      company_name: '',
      invoice_number: '',
      notes: '',
      invoice_file: null,
    });
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const tenantId = currentTenantId || await getCurrentTenantId(true);
    if (!tenantId) {
      alert('No tenant membership found for current user.');
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([{
        tenant_id: tenantId,
        customer_segment: 'service_client',
        name: newCustomerData.name,
        email: newCustomerData.email || null,
        phone: newCustomerData.phone || null,
        address: newCustomerData.address || null,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding customer:', error);
      alert('Failed to add customer');
    } else if (data) {
      setCustomers([...customers, data]);
      setFormData({...formData, customer_name: data.name});
      setShowAddCustomerModal(false);
      setNewCustomerData({ name: '', email: '', phone: '', address: '' });
      alert('Customer added successfully!');
    }

    setSubmitting(false);
  }

  function getCategoryName(categoryId: string) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : categoryId;
  }

  function getPaymentMethodName(methodId: string) {
    const method = paymentMethods.find(m => m.id === methodId);
    return method ? method.name : methodId;
  }

  const filteredIncomes = incomes.filter((income) => {
    const matchesSearch =
      income.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      income.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (income.customer_name && income.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (income.invoice_number && income.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = filterCategory === 'all' || income.category === filterCategory;
    const matchesPayment = filterPaymentMethod === 'all' || income.payment_method === filterPaymentMethod;
    const matchesSourceType = filterSourceType === 'all' || income.source_type === filterSourceType;

    return matchesSearch && matchesCategory && matchesPayment && matchesSourceType;
  });

  const getIncomeUsd = (income: Income) => income.amount_usd ?? income.amount ?? 0;
  const getIncomeSyp = (income: Income) => income.amount_syp ?? 0;

  const totalIncomeUsd = incomes.reduce((sum, inc) => sum + getIncomeUsd(inc), 0);
  const totalIncomeSyp = incomes.reduce((sum, inc) => sum + getIncomeSyp(inc), 0);
  const filteredTotalUsd = filteredIncomes.reduce((sum, inc) => sum + getIncomeUsd(inc), 0);
  const filteredTotalSyp = filteredIncomes.reduce((sum, inc) => sum + getIncomeSyp(inc), 0);

  // Calculate source type breakdown
  const invoicePaymentsTotalUsd = incomes
    .filter(inc => inc.source_type === 'invoice_payment')
    .reduce((sum, inc) => sum + getIncomeUsd(inc), 0);
  const invoicePaymentsTotalSyp = incomes
    .filter(inc => inc.source_type === 'invoice_payment')
    .reduce((sum, inc) => sum + getIncomeSyp(inc), 0);
  const manualIncomeTotalUsd = incomes
    .filter(inc => inc.source_type === 'manual' || !inc.source_type)
    .reduce((sum, inc) => sum + getIncomeUsd(inc), 0);
  const manualIncomeTotalSyp = incomes
    .filter(inc => inc.source_type === 'manual' || !inc.source_type)
    .reduce((sum, inc) => sum + getIncomeSyp(inc), 0);
  const invoicePaymentsCount = incomes.filter(inc => inc.source_type === 'invoice_payment').length;
  const manualIncomeCount = incomes.filter(inc => inc.source_type === 'manual' || !inc.source_type).length;

  // Calculate category breakdown using USD values
  const categoryTotals: Record<string, number> = {};
  incomes.forEach(inc => {
    categoryTotals[inc.category] = (categoryTotals[inc.category] || 0) + getIncomeUsd(inc);
  });
  const topCategory = Object.keys(categoryTotals).reduce((a, b) =>
    categoryTotals[a] > categoryTotals[b] ? a : b, Object.keys(categoryTotals)[0] || ''
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen" style={{ backgroundColor: '#FDF8F8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#FF6666' }}></div>
          <p className="mt-4 text-gray-600">{t.common.loading}</p>
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
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#10B981' }}>
                <TrendingUp size={24} className="text-white" />
              </div>
              {t.income.title}
            </h1>
            <p className="mt-1 ml-0 sm:ml-16 text-sm" style={{ color: '#6B7280' }}>{t.income.subtitle}</p>
          </div>
          <button
            onClick={() => {
              console.log('Add Income button clicked');
              setShowAddModal(true);
            }}
            className="flex items-center justify-center gap-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-all shadow-md text-sm font-medium w-full sm:w-auto"
            style={{ backgroundColor: '#10B981' }}
          >
            <Plus size={16} />
            {t.income.addIncome}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">{t.income.totalIncome}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalIncomeUsd.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">SYP {totalIncomeSyp.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                <DollarSign size={24} style={{ color: '#10B981' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Total Records</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{incomes.length}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#E0F2FE' }}>
                <FileText size={24} style={{ color: '#0EA5E9' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Top Category</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{getCategoryName(topCategory)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#FEF3C7' }}>
                <Tag size={24} style={{ color: '#F59E0B' }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Filtered Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">USD ${filteredTotalUsd.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">SYP {filteredTotalSyp.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F3E8FF' }}>
                <BarChart3 size={24} style={{ color: '#A855F7' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Income Breakdown: Invoice Payments vs Manual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg shadow-sm border border-blue-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-800 font-medium uppercase tracking-wide flex items-center gap-1">
                  🔗 Invoice Payments
                </p>
                <p className="text-2xl font-bold text-blue-900 mt-1">USD ${invoicePaymentsTotalUsd.toFixed(2)}</p>
                <p className="text-xs text-blue-700 mt-1">SYP {invoicePaymentsTotalSyp.toFixed(2)}</p>
                <p className="text-xs text-blue-700 mt-1">{invoicePaymentsCount} payment{invoicePaymentsCount !== 1 ? 's' : ''} (Auto-synced)</p>
              </div>
              <div className="p-3 rounded-lg bg-white">
                <FileText size={24} style={{ color: '#1E40AF' }} />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-lg shadow-sm border border-amber-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-800 font-medium uppercase tracking-wide flex items-center gap-1">
                  ✏️ Manual Income
                </p>
                <p className="text-2xl font-bold text-amber-900 mt-1">USD ${manualIncomeTotalUsd.toFixed(2)}</p>
                <p className="text-xs text-amber-700 mt-1">SYP {manualIncomeTotalSyp.toFixed(2)}</p>
                <p className="text-xs text-amber-700 mt-1">{manualIncomeCount} entr{manualIncomeCount !== 1 ? 'ies' : 'y'} (Other sources)</p>
              </div>
              <div className="p-3 rounded-lg bg-white">
                <Edit size={24} style={{ color: '#92400E' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by description, category, customer, or invoice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <select
                value={filterPaymentMethod}
                onChange={(e) => setFilterPaymentMethod(e.target.value)}
                className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="all">All Payment Methods</option>
                {paymentMethods.map(method => (
                  <option key={method.id} value={method.id}>{method.name}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value as 'all' | 'invoice_payment' | 'manual')}
                className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="all">All Income Types</option>
                <option value="invoice_payment">🔗 Invoice Payments</option>
                <option value="manual">✏️ Manual Income</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Income Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#F9FAFB' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.date}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.category}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.description}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.customerName}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Contact Person</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.receivedBy}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.amount}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.paymentMethod}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">{t.income.actions}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredIncomes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <TrendingUp size={48} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500 text-sm">{t.income.noIncome}</p>
                  </td>
                </tr>
              ) : (
                filteredIncomes.map((income) => (
                  <tr key={income.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {new Date(income.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {income.source_type === 'invoice_payment' ? (
                        <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-full" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }} title="Auto-generated from invoice payment">
                          🔗 Auto
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }} title="Manually added income">
                          ✏️ Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#047857' }}>
                        {getCategoryName(income.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{income.description}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium" style={{ color: '#10B981' }}>
                      {income.invoice_number || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {income.customer_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {income.company_name || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {income.added_by || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      ${getIncomeUsd(income).toFixed(2)}
                      <div className="text-xs text-gray-500">SYP {getIncomeSyp(income).toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {income.payment_method ? getPaymentMethodName(income.payment_method) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex gap-2 items-center">
                        <div style={{ width: '28px', display: 'inline-flex', justifyContent: 'center' }}>
                          {income.invoice_image_url ? (
                            <a
                              href={income.invoice_image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 inline-block"
                              style={{ color: '#10B981' }}
                              title="View Invoice"
                            >
                              <FileText size={16} />
                            </a>
                          ) : (
                            <span style={{ width: '28px', display: 'inline-block' }}></span>
                          )}
                        </div>
                        <>
                          <button
                            onClick={() => openEditModal(income)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
                            style={{ color: '#0EA5E9' }}
                            title="Edit Income"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteIncome(income)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
                            style={{ color: '#EF4444' }}
                            title="Delete Income"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Income Modal */}
      {showAddModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#10B981' }}>
                  <TrendingUp size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>{t.income.addIncome}</h2>
              </div>
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddIncome}>
              {/* Form Content */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0">
                {/* Category */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.category} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  >
                    <option value="">{t.income.selectCategory}</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Amount USD */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    USD {t.income.amount} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.amount_usd}
                      onChange={(e) => setFormData({...formData, amount_usd: e.target.value})}
                      className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Amount SYP */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    SYP {t.income.amount}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">SYP</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount_syp}
                      onChange={(e) => setFormData({...formData, amount_syp: e.target.value})}
                      className="w-full pl-16 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Description - Full Width */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.description} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    placeholder={t.income.enterDescription}
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.date} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.paymentMethod}
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  >
                    <option value="">{t.income.selectPayment}</option>
                    {paymentMethods.map(method => (
                      <option key={method.id} value={method.id}>{method.name}</option>
                    ))}
                  </select>
                </div>

                {/* Received By */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.receivedBy} <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.received_by}
                    onChange={(e) => setFormData({...formData, received_by: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  >
                    <option value="">{t.income.selectEmployee}</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.name}>
                        {employee.name} - {employee.role || 'Employee'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.income.customerName}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.customer_name}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setShowAddCustomerModal(true);
                        } else {
                          setFormData({...formData, customer_name: e.target.value});
                        }
                      }}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    >
                      <option value="">Select Customer</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.name}>{customer.name}</option>
                      ))}
                      <option value="__ADD_NEW__" style={{ fontWeight: 'bold', color: '#10B981' }}>+ Add New Customer</option>
                    </select>
                  </div>
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    placeholder="Enter contact person name"
                  />
                </div>

                {/* Invoice Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                    placeholder="e.g., INV-001"
                  />
                </div>

                {/* Upload Invoice - Full Width */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload Invoice
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormData({...formData, invoice_file: file});
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:text-white file:cursor-pointer hover:file:opacity-90"
                  />
                  <style jsx>{`
                    input[type="file"]::file-selector-button {
                      background-color: #01113B;
                    }
                  `}</style>
                  {formData.invoice_file && (
                    <p className="text-xs text-gray-600 mt-2">
                      📎 Selected: {formData.invoice_file.name}
                    </p>
                  )}
                </div>

                {/* Notes - Full Width */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.income.notes}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent resize-none"
                    rows={2}
                    placeholder={t.income.additionalNotes}
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
                    {t.income.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm hover:opacity-90"
                    style={{ backgroundColor: '#01113B' }}
                  >
                    {submitting ? t.income.saving : t.income.save}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Income Modal */}
      {showEditModal && selectedIncome && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-8">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#10B981' }}>
                  <TrendingUp size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>{t.income.editIncome}</h2>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setSelectedIncome(null); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUpdateIncome}>
              {/* Form Content */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.category} *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.description} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    USD {t.income.amount} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount_usd}
                    onChange={(e) => setFormData({...formData, amount_usd: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SYP {t.income.amount}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount_syp}
                    onChange={(e) => setFormData({...formData, amount_syp: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.date} *
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.paymentMethod}
                </label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">{t.income.selectPayment}</option>
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.id}>{method.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.receivedBy} *
                </label>
                <select
                  required
                  value={formData.received_by}
                  onChange={(e) => setFormData({...formData, received_by: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">{t.income.selectEmployee}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.name}>
                      {employee.name} - {employee.role || 'Employee'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.customerName}
                </label>
                <select
                  value={formData.customer_name}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowAddCustomerModal(true);
                    } else {
                      setFormData({...formData, customer_name: e.target.value});
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select Customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.name}>{customer.name}</option>
                  ))}
                  <option value="__ADD_NEW__" style={{ fontWeight: 'bold', color: '#10B981' }}>+ Add New Customer</option>
                </select>
              </div>

              {/* Contact Person */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter contact person name"
                />
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                  placeholder="e.g., INV-001"
                />
              </div>

              {/* Invoice Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Invoice
                </label>
                {selectedIncome?.invoice_image_url && (
                  <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={16} style={{ color: '#10B981' }} />
                      <span className="text-sm text-green-800">Invoice already uploaded</span>
                    </div>
                    <a
                      href={selectedIncome.invoice_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:text-green-800 underline"
                    >
                      View
                    </a>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFormData({...formData, invoice_file: file});
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:text-white file:cursor-pointer hover:file:opacity-90"
                />
                <style jsx>{`
                  input[type="file"]::file-selector-button {
                    background-color: #01113B;
                  }
                `}</style>
                {formData.invoice_file && (
                  <p className="text-xs text-gray-600 mt-2">
                    📎 New file: {formData.invoice_file.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.income.notes}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>

              {/* Footer Buttons */}
              <div className="px-6 py-4 border-t border-gray-200 bg-white">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setSelectedIncome(null); resetForm(); }}
                    disabled={submitting}
                    className="flex-1 px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 transition-all text-sm"
                  >
                    {t.income.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm hover:opacity-90"
                    style={{ backgroundColor: '#01113B' }}
                  >
                    {submitting ? t.income.saving : t.income.save}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center" style={{ backgroundColor: '#FDF8F8' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#10B981' }}>
                  <User size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#01113B' }}>Add New Customer</h2>
              </div>
              <button
                onClick={() => { setShowAddCustomerModal(false); setNewCustomerData({ name: '', email: '', phone: '', address: '' }); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddCustomer}>
              <div className="px-6 py-4 space-y-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerData.name}
                    onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                    placeholder="Enter customer name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCustomerData.email}
                    onChange={(e) => setNewCustomerData({...newCustomerData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                    placeholder="customer@example.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newCustomerData.phone}
                    onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
                    placeholder="+963-XXX-XXXX"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <textarea
                    value={newCustomerData.address}
                    onChange={(e) => setNewCustomerData({...newCustomerData, address: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent resize-none"
                    rows={2}
                    placeholder="Enter address"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="px-6 py-4 border-t border-gray-200 bg-white">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAddCustomerModal(false); setNewCustomerData({ name: '', email: '', phone: '', address: '' }); }}
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
                    {submitting ? 'Saving...' : 'Add Customer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
