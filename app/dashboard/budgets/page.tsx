import { PlanningTabs } from "@/components/layout/planning-tabs";
import { createClient } from '@/lib/supabase/server'
import { PageHeading } from '@/components/layout/page-heading'
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
    <div className="brand-page space-y-6">
      <PlanningTabs />
      <PageHeading title="Budgets" description="Set a spending limit for each category and see how the month is going." action={<AddBudgetButton />} />

      <BudgetList budgets={budgets || []} spentByCategory={spentByCategory} />
    </div>
  )
}
