'use client'

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create the transaction
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: item.account_id,
      category_id: item.category_id,
      type: item.type,
      amount: item.amount,
      description: item.description,
      date: new Date().toISOString().split('T')[0],
      is_recurring: true,
      recurring_id: item.id,
    })

    if (error) {
      toast.error('Failed to create transaction')
      return
    }

    // Update next_date based on frequency
    const nextDate = new Date(item.next_date)
    switch (item.frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1)
        break
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7)
        break
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1)
        break
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1)
        break
    }

    await supabase
      .from('recurring_transactions')
      .update({ next_date: nextDate.toISOString().split('T')[0] })
      .eq('id', item.id)

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
        <CardContent className="py-12 text-center text-gray-500">
          No recurring transactions yet. Add one to automate your regular income and expenses!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {recurring.map((item) => {
        const category = item.category as any
        const account = item.account as any
        return (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-2xl">{category?.icon || '💰'}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{category?.name || 'Uncategorized'}</h3>
                      <Badge variant={item.is_active ? 'default' : 'secondary'} className="text-xs">
                        {item.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500">
                      {account?.name} • {item.frequency} • Next: {formatDate(item.next_date)}
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`font-semibold ${
                      item.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleProcessNow(item)}>
                        <Play className="h-4 w-4 mr-2" />
                        Process Now
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggle(item)}>
                        {item.is_active ? (
                          <>
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(item)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
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
