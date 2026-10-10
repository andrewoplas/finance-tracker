'use client'

import { Budget } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface BudgetListProps {
  budgets: Budget[]
  spentByCategory: Record<string, number>
}

export function BudgetList({ budgets, spentByCategory }: BudgetListProps) {
  const supabase = createClient()
  const router = useRouter()

  const handleDelete = async (budget: Budget) => {
    if (!confirm('Are you sure you want to delete this budget?')) {
      return
    }

    const { error } = await supabase.from('budgets').delete().eq('id', budget.id)

    if (error) {
      toast.error('Failed to delete budget')
      return
    }

    toast.success('Budget deleted')
    router.refresh()
  }

  if (budgets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No budgets yet. Set up your first budget to track spending!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {budgets.map((budget) => {
        const category = budget.category
        const spent = spentByCategory[budget.category_id] || 0
        const percentage = Math.min((spent / Number(budget.amount)) * 100, 100)
        const isOverBudget = spent > Number(budget.amount)

        return (
          <Card key={budget.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{category?.icon || '📊'}</span>
                  <div>
                    <h3 className="font-semibold">{category?.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{budget.period}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Manage ${budget.category?.name || 'budget'}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDelete(budget)}
                      className="text-expense"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={isOverBudget ? 'text-expense font-medium' : ''}>
                    {formatCurrency(spent)} spent
                  </span>
                  <span className="text-muted-foreground">
                    of {formatCurrency(Number(budget.amount))}
                  </span>
                </div>

                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isOverBudget
                        ? 'bg-expense'
                        : percentage > 80
                        ? 'bg-warning'
                        : 'bg-income'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {isOverBudget && (
                  <p className="text-sm text-expense">
                    ⚠️ Over budget by {formatCurrency(spent - Number(budget.amount))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
