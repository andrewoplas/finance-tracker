'use client'

import { BrandLogo } from "./brand-logo";

import { MonthlyLink as Link } from "@/components/dashboard/monthly-link";
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Target,
  Settings,
  LogOut,
  Menu,

} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard?view=transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/dashboard?view=analysis', label: 'Planning', icon: Target },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
];
const bottomNavItems = [{ href: '/dashboard/settings', label: 'Settings', icon: Settings }];

function NavContent({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const monthlyHref = (href: string) => {
    if (!search.get('month') || !['/dashboard', '/dashboard/reports'].includes(href.split('?')[0])) return href;
    const [path, query] = href.split('?');
    const params = new URLSearchParams(query);
    params.set('month', search.get('month')!);
    return `${path}?${params}`;
  }
  const isCurrent = (href: string) => {
    const [path, query] = href.split('?');
    if (href === '/dashboard?view=analysis' && ['/dashboard/plans','/dashboard/budgets','/dashboard/recurring'].includes(pathname)) return true;
    if (href === '/dashboard/settings' && pathname === '/dashboard/accounts') return true;
    if (href === '/dashboard/reports' && pathname === '/dashboard' && search.get('view') === 'reflection') return true;
    if (pathname !== path) return false;
    return path !== '/dashboard' || (search.get('view') || 'overview') === (new URLSearchParams(query).get('view') || 'overview');
  };
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="finance-nav flex flex-col h-full min-h-0">
      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = isCurrent(item.href)
            return (
              <Link
                key={item.href}
                href={monthlyHref(item.href)}
                aria-current={isActive ? 'page' : undefined}
                onClick={onItemClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm group',
                  isActive
                    ? 'bg-accent text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  !isActive && ''
                )} />
                <span className={cn(
                  'font-medium',
                  isActive && 'font-semibold'
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>

      </nav>

      {/* Bottom Section */}
      <div className="px-3 py-4 border-t border-border/50">
        {bottomNavItems.map((item) => {
          const isActive = isCurrent(item.href)
          return (
            <Link
              key={item.href}
              href={monthlyHref(item.href)}
              onClick={onItemClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm group',
                isActive
                  ? 'bg-accent text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className={cn(
                'h-5 w-5 transition-transform duration-200',
                !isActive && ''
              )} />
              <span className={cn(
                'font-medium',
                isActive && 'font-semibold'
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
        
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 py-2.5 h-auto mt-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Log out</span>
        </Button>
      </div>
    </div>
  )
}

function Logo() { return <BrandLogo /> }

export function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-b border-border/50 flex items-center justify-between px-4 z-50">
        <Logo />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button aria-label="Open navigation" variant="ghost" size="icon" className="rounded-xl hover:bg-accent">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 border-r-0">
            <SheetTitle className="sr-only">Main navigation</SheetTitle>
            <SheetDescription className="sr-only">Navigate your Finance workspace.</SheetDescription>
            <div className="p-5 border-b border-border/50">
              <Logo />
            </div>
            <NavContent onItemClick={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 bg-sidebar border-r border-sidebar-border h-dvh flex-col fixed left-0 top-0">
        <div className="p-5 border-b border-sidebar-border/50">
          <Logo />
        </div>
        <NavContent />
      </aside>
      
      {/* Spacer for fixed sidebar */}
      <div className="hidden lg:block w-56 flex-shrink-0" />
    </>
  )
}
