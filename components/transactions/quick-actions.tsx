'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface FrequentTransaction {
  description: string
  amount: number
  type: 'income' | 'expense' | 'transfer'
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  account_id: string | null
  account_name: string | null
  frequency: number
}

interface QuickActionsProps {
  frequentTransactions: FrequentTransaction[]
}

export function QuickActions({ frequentTransactions }: QuickActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  if (!frequentTransactions || frequentTransactions.length === 0) {
    return null
  }

  const handleQuickLog = async (tx: FrequentTransaction) => {
    const key = `${tx.description}_${tx.amount}`
    setLoading(key)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Not authenticated')
        return
      }

      // Insert the transaction with today's date
      const today = new Date().toISOString().split('T')[0]
      
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        category_id: tx.category_id,
        account_id: tx.account_id,
        date: today,
      })

      if (error) throw error

      toast.success(`Logged: ${tx.description} ₱${tx.amount.toFixed(2)}`)
      router.refresh()
    } catch (error) {
      console.error('Quick log error:', error)
      toast.error('Failed to log transaction')
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Quick Log</h3>
        <span className="text-xs text-muted-foreground">
          (Tap to log instantly)
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {frequentTransactions.map((tx, index) => {
          const key = `${tx.description}_${tx.amount}`
          const isLoading = loading === key
          const sign = tx.type === 'income' ? '+' : '-'
          const colorClass = tx.type === 'income' ? 'text-income' : 'text-expense'

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ 
                duration: 0.2, 
                delay: index * 0.05,
                ease: [0.23, 1, 0.32, 1]
              }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickLog(tx)}
                disabled={isLoading}
                className="group relative overflow-hidden hover:border-primary/50 hover:shadow-sm"
              >
                {/* Icon */}
                {tx.category_icon && (
                  <span className="text-base mr-1 group-hover:scale-110 transition-transform">
                    {tx.category_icon}
                  </span>
                )}
                
                {/* Description */}
                <span className="font-medium">{tx.description}</span>
                
                {/* Amount */}
                <span className={`ml-2 font-semibold tabular-nums ${colorClass}`}>
                  {sign}₱{tx.amount.toFixed(0)}
                </span>

                {/* Frequency badge */}
                {tx.frequency > 1 && (
                  <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {tx.frequency}x
                  </span>
                )}

                {/* Loading spinner */}
                {isLoading && (
                  <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
              </Button>
            </motion.div>
          )
        })}
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
        <span>💡</span>
        <span>Based on your last 60 days of transactions</span>
      </p>
    </motion.div>
  )
}
