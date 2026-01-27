'use client'

import { Transaction } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface TransactionListProps {
  transactions: Transaction[]
}

export function TransactionList({ transactions }: TransactionListProps) {
  const supabase = createClient()
  const router = useRouter()

  const handleDelete = async (transaction: Transaction) => {
    if (!confirm('Are you sure you want to delete this transaction?')) {
      return
    }

    const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)

    if (error) {
      toast.error('Failed to delete transaction')
      return
    }

    toast.success('Transaction deleted')
    router.refresh()
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          No transactions yet. Add your first one!
        </CardContent>
      </Card>
    )
  }

  // Group transactions by date
  const groupedTransactions: Record<string, Transaction[]> = {}
  transactions.forEach((t) => {
    if (!groupedTransactions[t.date]) {
      groupedTransactions[t.date] = []
    }
    groupedTransactions[t.date].push(t)
  })

  return (
    <div className="space-y-6">
      {Object.entries(groupedTransactions).map(([date, dayTransactions]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-gray-500 mb-2">{formatDate(date)}</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {dayTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {(transaction.category as any)?.icon ||
                        (transaction.type === 'transfer' ? '↔️' : '💰')}
                    </div>
                    <div>
                      <p className="font-medium">
                        {(transaction.category as any)?.name ||
                          (transaction.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                      </p>
                      <p className="text-sm text-gray-500">
                        {transaction.description ||
                          (transaction.type === 'transfer'
                            ? `${(transaction.account as any)?.name} → ${(transaction.to_account as any)?.name}`
                            : (transaction.account as any)?.name)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          transaction.type === 'income'
                            ? 'text-green-600'
                            : transaction.type === 'expense'
                            ? 'text-red-600'
                            : 'text-blue-600'
                        }`}
                      >
                        {transaction.type === 'income'
                          ? '+'
                          : transaction.type === 'expense'
                          ? '-'
                          : ''}
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDelete(transaction)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
