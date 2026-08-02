export interface Supplier {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name_en: string;
  name_ar?: string;
  description_en: string;
  description_ar?: string;
  price: number;
  price_syp?: number;
  unit?: string;
  cost_price?: number;
  cost_price_syp?: number;
  stock: number;
  category: string;
  subcategory?: string;
  image_url?: string;
  supplier_id?: string;
  invoice_number?: string;
  invoice_image_url?: string;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProductSubcategory {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  total_amount: number;
  total_amount_usd?: number;
  total_amount_syp?: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  items: OrderItem[];
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface Customer {
  id: string;
  name: string;
  customer_segment?: 'product_buyer' | 'service_client';
  company?: string;
  email: string;
  phone?: string;
  address?: string;
  total_orders: number;
  total_spent: number;
  created_at: string;
}

export interface DashboardStats {
  totalRevenue: number;
  totalRevenueSyp: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  recentOrders: Order[];
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  amount_usd?: number;
  amount_syp?: number;
  date: string;
  payment_method?: string;
  notes?: string;
  added_by: string;
  car_plate?: string;
  invoice_number?: string;
  invoice_image_url?: string;
  supplier_id?: string;
  product_id?: string;
  created_at: string;
  updated_at: string;
}

export type EmployeeRole = 'admin' | 'manager' | 'accountant' | 'warehouse' | 'sales' | 'driver' | 'employee';

export interface EmployeePermissions {
  dashboard?: boolean;
  products?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  orders?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  customers?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  expenses?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  employees?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  analytics?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: EmployeeRole;
  permissions: EmployeePermissions;
  is_active: boolean;
  hire_date: string;
  salary?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Income {
  id: string;
  category: string;
  description: string;
  amount: number;
  amount_usd?: number;
  amount_syp?: number;
  date: string;
  payment_method?: string;
  customer_name?: string;
  company_name?: string;
  invoice_number?: string;
  invoice_image_url?: string;
  notes?: string;
  added_by: string;
  source_type?: 'invoice_payment' | 'manual';
  invoice_id?: string;
  payment_id?: string;
  is_editable?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name: string;
  company_name?: string;
  invoice_date: string;
  due_date?: string;
  total_amount: number;
  total_amount_usd?: number;
  total_amount_syp?: number;
  amount_paid: number;
  amount_paid_usd?: number;
  amount_paid_syp?: number;
  balance: number;
  balance_usd?: number;
  balance_syp?: number;
  status: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'cancelled';
  category?: string;
  description?: string;
  invoice_image_url?: string;
  notes?: string;
  added_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  payment_number?: string;
  amount: number;
  amount_usd?: number;
  amount_syp?: number;
  payment_date: string;
  payment_method?: string;
  reference_number?: string;
  notes?: string;
  received_by?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  product_name: string;
  category?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  unit?: string;
  notes?: string;
  created_at: string;
}
