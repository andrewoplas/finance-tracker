import { createClient } from '@/lib/supabase/server'
import { TransactionListWithFilters } from '@/components/transactions/transaction-list-with-filters'
import { QuickAddTransaction } from '@/components/dashboard/quick-add-transaction'

export default async function TransactionsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts(name, icon),
      category:categories(name, icon, color),
      to_account:accounts!transactions_to_account_id_fkey(name, icon),
      wallet:wallets(name, icon, color)
    `)
    .eq('user_id', user?.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (transactionsError) {
    console.error('Error loading transactions:', transactionsError)
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user?.id)
    .eq('is_archived', false)

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <QuickAddTransaction />
      </div>

      <TransactionListWithFilters 
        transactions={transactions || []}
        accounts={accounts || []}
        categories={categories || []}
      />
    </div>
  )
}
