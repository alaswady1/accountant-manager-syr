'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Briefcase,
  TrendingUp,
  DollarSign,
  UserCog,
  BarChart3,
  LogOut,
  Building2,
  FileText,
} from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import LanguageSwitcher from './LanguageSwitcher';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Sidebar() {
  const DASHBOARD_COOKIE = 'am-dashboard-auth';
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        alert('Failed to logout: ' + error.message);
      } else {
        console.log('✅ Logged out successfully');
        document.cookie = `${DASHBOARD_COOKIE}=; path=/; max-age=0; samesite=lax`;
        // Redirect to login page
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout error:', err);
      alert('Failed to logout');
    }
  }

  const menuSections = [
    {
      title: 'Overview',
      items: [
        { name: t.nav.dashboard, href: '/dashboard', icon: LayoutDashboard },
        { name: t.nav.products, href: '/dashboard/products', icon: Package },
        { name: t.nav.orders, href: '/dashboard/orders', icon: ShoppingCart },
      ]
    },
    {
      title: 'Economy',
      items: [
        { name: t.nav.expenses, href: '/dashboard/expenses', icon: DollarSign },
        { name: t.nav.income, href: '/dashboard/income', icon: TrendingUp },
        { name: t.nav.invoices, href: '/dashboard/invoices', icon: FileText },
        { name: t.nav.analytics, href: '/dashboard/analytics', icon: BarChart3 },
        { name: t.nav.reports, href: '/dashboard/reports', icon: BarChart3 },
      ]
    },
    {
      title: 'Management',
      items: [
        { name: t.nav.employees, href: '/dashboard/employees', icon: UserCog },
        { name: t.nav.customers, href: '/dashboard/customers', icon: Users },
        { name: 'Clients', href: '/dashboard/clients', icon: Briefcase },
        { name: 'Suppliers', href: '/dashboard/suppliers', icon: Building2 },
      ]
    }
  ];
  const flatMenuItems = menuSections.flatMap((section) => section.items);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <>
        <div className="lg:hidden border-b text-white" style={{ backgroundColor: '#01113B', borderColor: '#334155' }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="font-bold" style={{ fontSize: '16px' }}>Accountant Manager</h1>
              <p className="mt-0.5" style={{ color: '#94A3B8', fontSize: '12px' }}>SYR</p>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex h-screen w-64 text-white flex-col" style={{ backgroundColor: '#1E293B' }}>
          <div className="p-4 border-b" style={{ borderColor: '#334155' }}>
            <h1 className="font-bold" style={{ fontSize: '17px' }}>Accountant Manager</h1>
            <p className="mt-0.5" style={{ color: '#94A3B8', fontSize: '13px' }}>SYR</p>
          </div>
          <div className="flex-1 flex overflow-hidden">
          <div className="w-14 border-r p-2" style={{ borderColor: '#334155' }}>
            <div className="animate-pulse space-y-2">
              <div className="h-9 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
              <div className="h-9 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
              <div className="h-9 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-3">
            <div className="animate-pulse space-y-2">
              <div className="h-8 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
              <div className="h-8 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
              <div className="h-8 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
              <div className="h-8 rounded-lg" style={{ backgroundColor: '#334155' }}></div>
            </div>
          </nav>
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="lg:hidden border-b text-white" style={{ backgroundColor: '#01113B', borderColor: '#334155' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold" style={{ fontSize: '16px' }}>Accountant Manager</h1>
            <p className="mt-0.5" style={{ color: '#94A3B8', fontSize: '12px' }}>SYR</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-opacity-10"
              style={{ color: '#94A3B8' }}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <nav className="px-3 pb-3 overflow-x-auto">
          <div className="flex items-stretch gap-2 min-w-max">
            {flatMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: isActive ? '#FF6666' : 'rgba(255,255,255,0.05)',
                    color: isActive ? '#FFFFFF' : '#CBD5E1',
                    fontSize: '12px',
                  }}
                >
                  <Icon size={14} />
                  <span className="whitespace-nowrap font-medium">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="hidden lg:flex h-screen w-64 text-white flex-col" style={{ backgroundColor: '#01113B' }}>
      {/* Logo */}
      <div className="p-4 border-b" style={{ borderColor: '#334155' }}>
        <h1 className="font-bold" style={{ fontSize: '17px' }}>Accountant Manager</h1>
        <p className="mt-0.5" style={{ color: '#94A3B8', fontSize: '13px' }}>SYR</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Icon Rail */}
        <div className="w-14 border-r p-3 flex flex-col" style={{ borderColor: '#334155' }}>
          <div className="space-y-4">
            {menuSections.map((section, sectionIndex) => (
              <div key={`rail-section-${sectionIndex}`}>
                {/* Spacer to match section header height in text menu */}
                <div className="px-3 mb-2 h-4" />

                <div className="space-y-1 flex flex-col items-center">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={`rail-${item.href}`}
                        href={item.href}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                        style={{
                          backgroundColor: isActive ? '#FF6666' : 'transparent',
                          color: isActive ? '#FFFFFF' : '#94A3B8',
                        }}
                        title={item.name}
                        aria-label={item.name}
                      >
                        <Icon size={17} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-2 border-t w-full flex flex-col items-center gap-2" style={{ borderColor: '#334155' }}>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {menuSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Section Header */}
              <div className="px-3 mb-2">
                <h3 className="font-semibold uppercase tracking-wider h-4 leading-4" style={{ fontSize: '10px', color: '#CBD5E1' }}>
                  {section.title}
                </h3>
              </div>

              {/* Section Items */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center h-8 px-3 rounded-lg transition-all duration-300 ${
                        isActive
                          ? 'text-white'
                          : 'hover:bg-opacity-10 hover:translate-x-1'
                      }`}
                      style={{
                        backgroundColor: isActive ? '#FF6666' : 'transparent',
                        color: isActive ? '#FFFFFF' : '#94A3B8',
                        fontSize: '13px',
                      }}
                    >
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Logout */}
      <div className="p-3 border-t" style={{ borderColor: '#334155' }}>
        <div className="pl-14">
          <button
            onClick={handleLogout}
            className="flex items-center flex-nowrap gap-2 px-3 py-2 rounded-lg w-full transition-colors hover:bg-opacity-10"
            style={{ color: '#94A3B8', fontSize: '13px' }}
          >
            <LogOut size={17} />
            <span className="font-medium whitespace-nowrap">Logout</span>
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
