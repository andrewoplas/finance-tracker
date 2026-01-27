'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ReactNode } from 'react'

interface MobilePageHeaderProps {
  title: string
  subtitle?: string
  showBack?: boolean
  action?: ReactNode
}

export function MobilePageHeader({
  title,
  subtitle,
  showBack = false,
  action,
}: MobilePageHeaderProps) {
  const router = useRouter()

  return (
    <>
      {/* Mobile sticky header - only visible on mobile */}
      <div className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border/50 -mx-4 px-4 py-3 mb-4 safe-area-top">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="shrink-0 rounded-xl"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-foreground truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>

      {/* Desktop header - hidden on mobile */}
      <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </>
  )
}
