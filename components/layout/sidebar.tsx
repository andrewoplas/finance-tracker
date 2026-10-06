'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Target,
  Settings,
  LogOut,
  Menu,

} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard?view=transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/dashboard/budgets', label: 'Budgets', icon: Target },
  { href: '/dashboard/accounts', label: 'Accounts', icon: Wallet },
]
const tools = [
  { href: '/dashboard/plans', label: 'Plans & shared money' },
  { href: '/dashboard/import', label: 'Import CSV' },
  { href: '/dashboard?view=reflection', label: 'Monthly reflection' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/recurring', label: 'Recurring' },
  { href: '/dashboard/wallets', label: 'Wallets' },
  { href: '/dashboard/transactions', label: 'Manual entry' },
]

const bottomNavItems = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function NavContent({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = (search.get('view') ? `${pathname}?view=${search.get('view')}` : pathname) === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
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
        <details className="mt-7 px-3 text-sm text-muted-foreground" open={tools.some(t => t.href === pathname)}>
          <summary className="cursor-pointer py-2">Tools</summary>
          {tools.map(item => <Link className="block py-2.5" key={item.href} href={item.href} onClick={onItemClick}>{item.label}</Link>)}
        </details>
      </nav>

      {/* Bottom Section */}
      <div className="px-3 py-4 border-t border-border/50">
        {bottomNavItems.map((item) => {
          const isActive = (search.get('view') ? `${pathname}?view=${search.get('view')}` : pathname) === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
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

function Logo() { return <div className="text-xl font-semibold tracking-tight">Finance</div> }

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
            <div className="p-5 border-b border-border/50">
              <Logo />
            </div>
            <NavContent onItemClick={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 bg-sidebar border-r border-sidebar-border h-screen flex-col fixed left-0 top-0">
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
