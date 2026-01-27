import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/constants'
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp } from 'lucide-react'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { AiTransactionDialog } from '@/components/transactions/ai-transaction-dialog'
import { AnimatedStatCard } from '@/components/dashboard/animated-stat-card'
import { PageTransition } from '@/components/ui/page-transition'

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
    <PageTransition>
      <div className="space-y-6 md:space-y-8 px-4 md:px-0 py-6 md:py-0">
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
          <AnimatedStatCard
            title="Total Balance"
            value={totalBalance}
            icon={Wallet}
            subtitle={`Across ${accounts?.length || 0} account${accounts?.length !== 1 ? 's' : ''}`}
            colorClass="text-primary"
            bgGradient="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
            prefix="₱"
            index={0}
          />

          <AnimatedStatCard
            title="Income"
            value={monthIncome}
            icon={ArrowDownRight}
            subtitle="This month"
            colorClass="text-income"
            bgGradient="bg-gradient-to-br from-income/10 via-income/5 to-transparent"
            prefix="₱"
            showSign
            index={1}
          />

          <AnimatedStatCard
            title="Expenses"
            value={-monthExpenses}
            icon={ArrowUpRight}
            subtitle="This month"
            colorClass="text-expense"
            bgGradient="bg-gradient-to-br from-expense/10 via-expense/5 to-transparent"
            prefix="₱"
            showSign
            index={2}
          />

          <AnimatedStatCard
            title="Net Savings"
            value={netAmount}
            icon={TrendingUp}
            subtitle="This month"
            colorClass={netAmount >= 0 ? 'text-income' : 'text-expense'}
            bgGradient="bg-gradient-to-br from-transfer/10 via-transfer/5 to-transparent"
            prefix="₱"
            showSign
            index={3}
          />
        </div>

        {/* Recent Transactions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
          </div>
          <RecentTransactions />
        </div>
      </div>
    </PageTransition>
  )
}
