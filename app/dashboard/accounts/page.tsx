import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, ACCOUNT_TYPES } from '@/lib/constants'
import { AccountList } from '@/components/accounts/account-list'
import { AddAccountButton } from '@/components/accounts/add-account-button'

export default async function AccountsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: true })

  const activeAccounts = accounts?.filter(a => !a.is_archived) || []
  const archivedAccounts = accounts?.filter(a => a.is_archived) || []
  const totalBalance = activeAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-gray-500">Total Balance: {formatCurrency(totalBalance)}</p>
        </div>
        <AddAccountButton />
      </div>

      <AccountList accounts={activeAccounts} />

      {archivedAccounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-600 mb-4">Archived Accounts</h2>
          <AccountList accounts={archivedAccounts} isArchived />
        </div>
      )}
    </div>
  )
}
