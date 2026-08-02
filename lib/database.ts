import { supabase } from './supabase';
import { Product, Order, Customer, DashboardStats } from './types';

const RETRYABLE_ERROR_CODES = new Set(['408', '42501', '429', '500', '502', '503', '504']);
const CACHE_TTL_SHORT_MS = 5_000;
const CACHE_TTL_STATS_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = queryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  queryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function invalidateCache(prefixes: string[]): void {
  if (prefixes.length === 0) return;

  for (const key of queryCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      queryCache.delete(key);
    }
  }
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}

export interface ProductsPageOptions {
  search?: string;
  category?: string;
  stock?: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';
  sortBy?: 'name' | 'price' | 'stock' | 'category' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface OrdersPageOptions {
  search?: string;
  status?: string;
}

export interface CustomersPageOptions {
  search?: string;
  segment?: 'product_buyer' | 'service_client';
}

function escapeForILike(value: string): string {
  return value.replace(/[%,]/g, ' ').trim();
}

function shouldRetry(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) return true;

  const message = (error.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('network') || message.includes('temporar');
}

async function withRetry<T>(operation: () => Promise<T>, retries = 2, baseDelayMs = 200): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

// ============================================
// PRODUCTS
// ============================================

export async function getProducts(): Promise<Product[]> {
  const cacheKey = 'products:list';
  const cached = getCached<Product[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await withRetry(async () =>
    supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
  );

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  const rows = data || [];
  setCached(cacheKey, rows, CACHE_TTL_SHORT_MS);
  return rows;
}

export async function getProductsPage(
  page = 1,
  pageSize = 50,
  options: ProductsPageOptions = {}
): Promise<PaginatedResult<Product>> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const search = (options.search || '').trim();
  const category = (options.category || '').trim();
  const stock = options.stock || 'all';
  const sortBy = options.sortBy || 'created_at';
  const sortOrder = options.sortOrder || 'desc';
  const cacheKey = `products:page:${safePage}:${safePageSize}:${search}:${category}:${stock}:${sortBy}:${sortOrder}`;
  const cached = getCached<PaginatedResult<Product>>(cacheKey);
  if (cached) return cached;

  let query = supabase.from('products').select('*', { count: 'exact' });

  if (search) {
    const searchTerm = escapeForILike(search);
    query = query.or(
      `name_en.ilike.%${searchTerm}%,name_ar.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%,subcategory.ilike.%${searchTerm}%`
    );
  }

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (stock === 'in-stock') {
    query = query.gt('stock', 10);
  } else if (stock === 'low-stock') {
    query = query.gt('stock', 0).lte('stock', 10);
  } else if (stock === 'out-of-stock') {
    query = query.eq('stock', 0);
  }

  const sortColumnMap: Record<NonNullable<ProductsPageOptions['sortBy']>, string> = {
    name: 'name_en',
    price: 'price',
    stock: 'stock',
    category: 'category',
    created_at: 'created_at',
  };

  const sortColumn = sortColumnMap[sortBy] || 'created_at';

  const { data, error, count } = await withRetry(async () =>
    query
      .order(sortColumn, { ascending: sortOrder === 'asc' })
      .order('created_at', { ascending: false })
      .range(from, to)
  );

  if (error) {
    console.error('Error fetching products page:', error);
    return { data: [], count: 0, page: safePage, pageSize: safePageSize };
  }

  const result: PaginatedResult<Product> = {
    data: data || [],
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };

  setCached(cacheKey, result, CACHE_TTL_SHORT_MS);
  return result;
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await withRetry(async () =>
    supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()
  );

  if (error) {
    console.error('Error fetching product:', error);
    return null;
  }

  return data;
}

export async function createProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single();

  if (error) {
    console.error('Error creating product:', error);
    return null;
  }

  invalidateCache(['products:', 'dashboard:stats']);

  return data;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating product:', error);
    return null;
  }

  invalidateCache(['products:', 'dashboard:stats']);

  return data;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product:', error);
    return false;
  }

  invalidateCache(['products:', 'dashboard:stats']);

  return true;
}

// ============================================
// ORDERS
// ============================================

export async function getOrders(): Promise<Order[]> {
  const cacheKey = 'orders:list';
  const cached = getCached<Order[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await withRetry(async () =>
    supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
  );

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  const rows = data || [];
  setCached(cacheKey, rows, CACHE_TTL_SHORT_MS);
  return rows;
}

export async function getOrdersPage(
  page = 1,
  pageSize = 50,
  options: OrdersPageOptions = {}
): Promise<PaginatedResult<Order>> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const search = (options.search || '').trim();
  const status = (options.status || '').trim();
  const cacheKey = `orders:page:${safePage}:${safePageSize}:${search}:${status}`;
  const cached = getCached<PaginatedResult<Order>>(cacheKey);
  if (cached) return cached;

  let query = supabase.from('orders').select('*', { count: 'exact' });

  if (search) {
    const searchTerm = escapeForILike(search);
    query = query.or(
      `id.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%`
    );
  }

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error, count } = await withRetry(async () =>
    query
      .order('created_at', { ascending: false })
      .range(from, to)
  );

  if (error) {
    console.error('Error fetching orders page:', error);
    return { data: [], count: 0, page: safePage, pageSize: safePageSize };
  }

  const result: PaginatedResult<Order> = {
    data: data || [],
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };

  setCached(cacheKey, result, CACHE_TTL_SHORT_MS);
  return result;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await withRetry(async () =>
    supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()
  );

  if (error) {
    console.error('Error fetching order:', error);
    return null;
  }

  return data;
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating order status:', error);
    return null;
  }

  invalidateCache(['orders:', 'dashboard:stats']);

  return data;
}

// ============================================
// CUSTOMERS
// ============================================

export async function getCustomers(): Promise<Customer[]> {
  const cacheKey = 'customers:list';
  const cached = getCached<Customer[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await withRetry(async () =>
    supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
  );

  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }

  const rows = data || [];
  setCached(cacheKey, rows, CACHE_TTL_SHORT_MS);
  return rows;
}

export async function getCustomersPage(
  page = 1,
  pageSize = 50,
  options: CustomersPageOptions = {}
): Promise<PaginatedResult<Customer>> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const search = (options.search || '').trim();
  const segment = options.segment || '';
  const cacheKey = `customers:page:${safePage}:${safePageSize}:${search}:${segment}`;
  const cached = getCached<PaginatedResult<Customer>>(cacheKey);
  if (cached) return cached;

  let query = supabase.from('customers').select('*', { count: 'exact' });

  if (search) {
    const searchTerm = escapeForILike(search);
    query = query.or(
      `name.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
    );
  }

  if (segment) {
    query = query.eq('customer_segment', segment);
  }

  const { data, error, count } = await withRetry(async () =>
    query
      .order('created_at', { ascending: false })
      .range(from, to)
  );

  if (error) {
    console.error('Error fetching customers page:', error);
    return { data: [], count: 0, page: safePage, pageSize: safePageSize };
  }

  const result: PaginatedResult<Customer> = {
    data: data || [],
    count: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };

  setCached(cacheKey, result, CACHE_TTL_SHORT_MS);
  return result;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await withRetry(async () =>
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
  );

  if (error) {
    console.error('Error fetching customer:', error);
    return null;
  }

  return data;
}

export async function createCustomer(customer: Omit<Customer, 'id' | 'created_at' | 'total_orders' | 'total_spent'>): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .insert([{
      ...customer,
      total_orders: 0,
      total_spent: 0,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating customer:', error);
    return null;
  }

  invalidateCache(['customers:', 'dashboard:stats']);

  return data;
}

// ============================================
// DASHBOARD STATS
// ============================================

export async function getDashboardStats(): Promise<DashboardStats> {
  const cacheKey = 'dashboard:stats';
  const cached = getCached<DashboardStats>(cacheKey);
  if (cached) return cached;

  // Use lightweight queries where possible to reduce payload under high concurrency.
  const [productsCountRes, ordersCountRes, customersCountRes, ordersTotalsRes, recentOrdersRes] = await Promise.all([
    withRetry(async () => supabase.from('products').select('*', { count: 'exact', head: true })),
    withRetry(async () => supabase.from('orders').select('*', { count: 'exact', head: true })),
    withRetry(async () => supabase.from('customers').select('*', { count: 'exact', head: true })),
    withRetry(async () =>
      supabase
        .from('orders')
        .select('total_amount,total_amount_usd,total_amount_syp')
    ),
    withRetry(async () =>
      supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
    ),
  ]);

  const ordersForTotals = ordersTotalsRes.data || [];
  const recentOrders = recentOrdersRes.data || [];

  // Calculate total revenue in both currencies.
  const totalRevenue = ordersForTotals.reduce(
    (sum, order) => sum + Number(order.total_amount_usd ?? order.total_amount ?? 0),
    0
  );
  const totalRevenueSyp = ordersForTotals.reduce(
    (sum, order) => sum + Number(order.total_amount_syp ?? 0),
    0
  );

  const result: DashboardStats = {
    totalRevenue,
    totalRevenueSyp,
    totalOrders: ordersCountRes.count ?? 0,
    totalProducts: productsCountRes.count ?? 0,
    totalCustomers: customersCountRes.count ?? 0,
    recentOrders,
  };

  setCached(cacheKey, result, CACHE_TTL_STATS_MS);
  return result;
}
