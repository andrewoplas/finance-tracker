'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AiTransactionDialog } from '@/components/transactions/ai-transaction-dialog'
import { motion } from 'framer-motion'

export function MobileFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* FAB Button - Only on mobile */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 md:hidden h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/40 flex items-center justify-center text-primary-foreground active:scale-95 transition-transform touch-manipulation"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>

      {/* Dialog */}
      <AiTransactionDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
