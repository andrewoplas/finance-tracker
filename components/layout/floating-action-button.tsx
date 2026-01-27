'use client'

import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiTransactionDialog } from '@/components/transactions/ai-transaction-dialog'

export function FloatingActionButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-6 lg:bottom-6 z-[60]",
          "h-14 w-14 rounded-full",
          "bg-gradient-to-br from-primary to-primary/90",
          "text-primary-foreground",
          "shadow-2xl shadow-primary/40",
          "hover:shadow-3xl hover:shadow-primary/50",
          "hover:scale-110",
          "active:scale-95",
          "transition-all duration-300",
          "flex items-center justify-center",
          "group"
        )}
        aria-label="Add transaction"
      >
        <Wand2 className="h-6 w-6 transition-transform duration-300 group-hover:rotate-12" />
      </button>

      <AiTransactionDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
