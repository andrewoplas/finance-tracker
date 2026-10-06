'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Transaction } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/constants'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchTransactions() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!transactions_account_id_fkey(name, icon),
          category:categories(name, icon, color)
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8)

      setTransactions(data || [])
      setLoading(false)
    }

    fetchTransactions()
  }, [supabase])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-semibold">Recent Transactions</CardTitle>
        <Link href="/dashboard/transactions">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5">
            View All 
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No transactions yet</h3>
            <p className="text-muted-foreground text-sm">
              Start tracking your finances!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {transactions.map((transaction, index) => {
              const category = transaction.category
              const account = transaction.account
              
              return (
                <div
                  key={transaction.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl transition-colors duration-200 group hover:bg-accent/50",
                    index === 0 && "bg-accent/30"
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div 
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-transform duration-200 group-hover:scale-105",
                        transaction.type === 'income' && "bg-income/15",
                        transaction.type === 'expense' && "bg-expense/15",
                        transaction.type === 'transfer' && "bg-transfer/15"
                      )}
                      style={category?.color ? { backgroundColor: `${category.color}20` } : undefined}
                    >
                      {category?.icon || (transaction.type === 'transfer' ? '↔️' : '💰')}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {category?.name || (transaction.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {transaction.description || account?.name || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <p className={cn(
                      "font-semibold tabular-nums text-sm",
                      transaction.type === 'income' && 'text-income',
                      transaction.type === 'expense' && 'text-expense',
                      transaction.type === 'transfer' && 'text-transfer'
                    )}>
                      {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''}
                      {formatCurrency(transaction.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(transaction.date)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
