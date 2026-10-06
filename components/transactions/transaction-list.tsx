'use client'

import { Transaction } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Trash2, ArrowRight, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { commitOperation } from '@/lib/finance/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SwipeableTransactionItem } from './swipeable-transaction-item'

interface TransactionListProps {
  transactions: Transaction[]
}

export function TransactionList({ transactions }: TransactionListProps) {
  const router = useRouter()

  const handleDelete = async (transaction: Transaction) => {
    if (!confirm('Reverse this transaction? It will remain in audit history.')) {
      return
    }

    const { error } = await commitOperation({ action: 'reverse', id: transaction.id, expected_revision: transaction.revision })

    if (error) {
      toast.error('Failed to delete transaction')
      return
    }

    toast.success('Transaction reversed')
    router.refresh()
  }

  if (transactions.length === 0) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No transactions yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Start tracking your finances by adding your first transaction
          </p>
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
        <div key={date} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground px-1">{formatDate(date)}</h3>
          <Card className="overflow-hidden">
            <CardContent className="divide-y divide-border/50 p-0">
              {dayTransactions.map((transaction) => {
                const category = transaction.category
                const account = transaction.account
                const toAccount = transaction.to_account
                
                return (
                  <SwipeableTransactionItem
                    key={transaction.id}
                    onDelete={() => handleDelete(transaction)}
                  >
                    <div
                      className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors duration-200 group"
                    >
                    <div className="flex items-center gap-4">
                      {/* Category Icon with colored background */}
                      <div 
                        className={cn(
                          "h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-transform duration-200 group-hover:scale-105",
                          transaction.type === 'income' && "bg-income/15",
                          transaction.type === 'expense' && "bg-expense/15",
                          transaction.type === 'transfer' && "bg-transfer/15"
                        )}
                        style={category?.color ? { backgroundColor: `${category.color}20` } : undefined}
                      >
                        {category?.icon || (transaction.type === 'transfer' ? '↔️' : '💰')}
                      </div>
                      
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {category?.name || (transaction.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                        </p>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          {transaction.type === 'transfer' ? (
                            <span className="flex items-center gap-1 truncate">
                              {account?.name || 'Unknown'}
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              {toAccount?.name || 'Unknown'}
                            </span>
                          ) : (
                            <span className="truncate">
                              {transaction.description || account?.name || 'No description'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p
                          className={cn(
                            "font-semibold tabular-nums text-base",
                            transaction.type === 'income' && 'text-income',
                            transaction.type === 'expense' && 'text-expense',
                            transaction.type === 'transfer' && 'text-transfer'
                          )}
                        >
                          {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : ''}
                          {formatCurrency(transaction.amount)}
                        </p>
                        {transaction.description && transaction.type !== 'transfer' && (
                          <p className="text-xs text-muted-foreground">{account?.name}</p>
                        )}
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => handleDelete(transaction)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    </div>
                  </SwipeableTransactionItem>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
