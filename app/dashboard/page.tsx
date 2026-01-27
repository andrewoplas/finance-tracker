import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp } from 'lucide-react'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { AiTransactionDialog } from '@/components/transactions/ai-transaction-dialog'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user?.id)
    .eq('is_archived', false)

  // Get this month's transactions
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { data: monthTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user?.id)
    .gte('date', startOfMonth.toISOString().split('T')[0])

  // Calculate totals
  const totalBalance = accounts?.reduce((sum, acc) => sum + Number(acc.balance), 0) || 0
  const monthIncome = monthTransactions
    ?.filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0) || 0
  const monthExpenses = monthTransactions
    ?.filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0) || 0
  const netAmount = monthIncome - monthExpenses

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return (
    <div className="space-y-8">
      {/* Header with Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {getGreeting()}, {firstName}! 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s your financial snapshot for this month
          </p>
        </div>
        <AiTransactionDialog />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Balance Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full -translate-y-8 translate-x-8" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Balance</span>
            </div>
            <div className="text-3xl font-bold text-foreground tabular-nums">
              {formatCurrency(totalBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Across {accounts?.length || 0} account{accounts?.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Income Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-income/10 via-income/5 to-transparent shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-income/10 rounded-full -translate-y-8 translate-x-8" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-income/20 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-income" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Income</span>
            </div>
            <div className="text-3xl font-bold text-income tabular-nums">
              +{formatCurrency(monthIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This month
            </p>
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-expense/10 via-expense/5 to-transparent shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-expense/10 rounded-full -translate-y-8 translate-x-8" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-expense/20 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-expense" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Expenses</span>
            </div>
            <div className="text-3xl font-bold text-expense tabular-nums">
              -{formatCurrency(monthExpenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This month
            </p>
          </CardContent>
        </Card>

        {/* Net Card */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-transfer/10 via-transfer/5 to-transparent shadow-sm hover:shadow-md transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-transfer/10 rounded-full -translate-y-8 translate-x-8" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-transfer/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-transfer" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Net Savings</span>
            </div>
            <div className={`text-3xl font-bold tabular-nums ${netAmount >= 0 ? 'text-income' : 'text-expense'}`}>
              {netAmount >= 0 ? '+' : ''}{formatCurrency(netAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
        </div>
        <RecentTransactions />
      </div>
    </div>
  )
}
