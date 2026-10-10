'use client'
import { commitOperation } from '@/lib/finance/client'
import { manilaToday } from '@/lib/finance/core'

import { RecurringTransaction } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Trash2, Play, Pause } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface RecurringListProps {
  recurring: RecurringTransaction[]
}

export function RecurringList({ recurring }: RecurringListProps) {
  const supabase = createClient()
  const router = useRouter()

  const handleToggle = async (item: RecurringTransaction) => {
    const { error } = await supabase
      .from('recurring_transactions')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)

    if (error) {
      toast.error('Failed to toggle recurring transaction')
      return
    }

    toast.success(item.is_active ? 'Paused' : 'Activated')
    router.refresh()
  }

  const handleProcessNow = async (item: RecurringTransaction) => {
    const { error } = await commitOperation({ action:'post_recurring', id:item.id, expected_next_date:item.next_date, date:manilaToday() })
    if(error) { toast.error(error.message); return }

    toast.success('Transaction created!')
    router.refresh()
  }

  const handleDelete = async (item: RecurringTransaction) => {
    if (!confirm('Delete this recurring transaction?')) return

    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', item.id)

    if (error) {
      toast.error('Failed to delete')
      return
    }

    toast.success('Deleted')
    router.refresh()
  }

  if (recurring.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No recurring transactions yet. Add a schedule to track your regular income and expenses.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {recurring.map((item) => {
        const category = item.category
        const account = item.account
        return (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="recurring-row">
                <div className="recurring-description flex items-center gap-3 min-w-0 flex-1">
                  <div className="text-2xl">{category?.icon || '💰'}</div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{category?.name || 'Uncategorized'}</h3>
                      <Badge variant={item.is_active ? 'default' : 'secondary'} className="text-xs">
                        {item.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {account?.name} • {item.frequency} • Next: {formatDate(item.next_date)}
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`font-semibold ${
                      item.type === 'income' ? 'text-income' : 'text-expense'
                    }`}>
                      {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Manage ${item.description || 'recurring transaction'}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleProcessNow(item)}>
                        <Play className="h-4 w-4" />
                        Post now
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggle(item)}>
                        {item.is_active ? (
                          <>
                            <Pause className="h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(item)}
                        className="text-expense"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
