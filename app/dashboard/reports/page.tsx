import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SpendingByCategory } from '@/components/reports/spending-by-category'
import { MonthlyTrend } from '@/components/reports/monthly-trend'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get transactions for the last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      category:categories(name, icon, color)
    `)
    .eq('user_id', user?.id)
    .gte('date', sixMonthsAgo.toISOString().split('T')[0])
    .order('date', { ascending: true })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingByCategory transactions={transactions || []} />
        <MonthlyTrend transactions={transactions || []} />
      </div>
    </div>
  )
}
