'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, ArrowLeftRight, Wallet, Briefcase } from 'lucide-react'
import { motion } from 'framer-motion'

const navItems = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: Home,
  },
  {
    name: 'Transactions',
    href: '/dashboard?view=transactions',
    icon: ArrowLeftRight,
  },
  {
    name: 'Accounts',
    href: '/dashboard/accounts',
    icon: Wallet,
  },
  {
    name: 'Plans',
    href: '/dashboard/plans',
    icon: Briefcase,
  },
]

export function BottomNavigation() {
  const pathname = usePathname()
  const search = useSearchParams()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = (search.get('view') ? `${pathname}?view=${search.get('view')}` : pathname) === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center flex-1 h-full relative group"
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="bottomNav"
                  className="absolute inset-0 bg-primary/10 rounded-xl mx-1"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}

              {/* Icon */}
              <div className="relative z-10 flex flex-col items-center gap-1">
                <Icon 
                  className={`h-5 w-5 transition-colors ${
                    isActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground group-active:text-primary'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                
                {/* Label */}
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground group-active:text-primary'
                  }`}
                >
                  {item.name}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
