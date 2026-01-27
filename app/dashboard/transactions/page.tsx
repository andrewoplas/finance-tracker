import { createClient } from '@/lib/supabase/server'
import { TransactionList } from '@/components/transactions/transaction-list'
import { QuickAddTransaction } from '@/components/dashboard/quick-add-transaction'

export default async function TransactionsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts(name, icon),
      category:categories(name, icon, color),
      to_account:accounts!transactions_to_account_id_fkey(name, icon)
    `)
    .eq('user_id', user?.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <QuickAddTransaction />
      </div>

      <TransactionList transactions={transactions || []} />
    </div>
  )
}
