import { createClient } from '@/lib/supabase/server'
import { TransactionListWithFilters } from '@/components/transactions/transaction-list-with-filters'
import { AiTransactionDialog } from '@/components/transactions/ai-transaction-dialog'
import { QuickActions } from '@/components/transactions/quick-actions'
import { getFrequentTransactions } from '@/lib/actions/frequent-transactions'
import { PageTransition } from '@/components/ui/page-transition'
import { MobilePageHeader } from '@/components/layout/mobile-page-header'
import { ArrowLeftRight } from 'lucide-react'

export default async function TransactionsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch transactions - need explicit FK names for multiple accounts joins
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts!transactions_account_id_fkey(name, icon),
      category:categories(name, icon, color),
      to_account:accounts!transactions_to_account_id_fkey(name, icon)
    `)
    .eq('user_id', user?.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user?.id)
    .eq('is_archived', false)

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)

  // Get frequent transactions for quick log
  const frequentTransactions = await getFrequentTransactions(5)

  const transactionCount = transactions?.length || 0

  return (
    <PageTransition>
      <div className="space-y-6 px-4 md:px-0 py-4 md:py-0">
        <MobilePageHeader
          title="Transactions"
          subtitle={`${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}`}
          action={<AiTransactionDialog />}
        />

      {/* Quick Actions */}
      <QuickActions frequentTransactions={frequentTransactions} />

      {/* Transaction List */}
      <TransactionListWithFilters 
        transactions={transactions || []}
        accounts={accounts || []}
        categories={categories || []}
      />
      </div>
    </PageTransition>
  )
}
