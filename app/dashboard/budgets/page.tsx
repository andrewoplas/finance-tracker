import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BudgetList } from '@/components/budgets/budget-list'
import { AddBudgetButton } from '@/components/budgets/add-budget-button'

export default async function BudgetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get budgets with categories
  const { data: budgets } = await supabase
    .from('budgets')
    .select(`
      *,
      category:categories(name, icon, color)
    `)
    .eq('user_id', user?.id)

  // Get current month expenses by category
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: transactions } = await supabase
    .from('transactions')
    .select('category_id, amount')
    .eq('user_id', user?.id)
    .eq('type', 'expense')
    .gte('date', startOfMonth.toISOString().split('T')[0])

  // Calculate spent per category
  const spentByCategory: Record<string, number> = {}
  transactions?.forEach((t) => {
    if (t.category_id) {
      spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Number(t.amount)
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <AddBudgetButton />
      </div>

      <BudgetList budgets={budgets || []} spentByCategory={spentByCategory} />
    </div>
  )
}
