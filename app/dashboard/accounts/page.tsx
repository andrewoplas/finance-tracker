import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/constants'
import { AccountList } from '@/components/accounts/account-list'
import { AddAccountButton } from '@/components/accounts/add-account-button'
import { PageTransition } from '@/components/ui/page-transition'
import { Wallet } from 'lucide-react'

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
    <PageTransition>
      <div className="space-y-6 md:space-y-8 px-4 md:px-0 py-6 md:py-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Accounts</h1>
          <div className="flex items-center gap-2 mt-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Total Balance: <span className="font-semibold text-foreground">{formatCurrency(totalBalance)}</span>
            </p>
          </div>
        </div>
        <AddAccountButton />
      </div>

      {/* Active Accounts */}
      <AccountList accounts={activeAccounts} />

        {/* Archived Accounts */}
        {archivedAccounts.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <h2 className="text-lg font-semibold text-muted-foreground">Archived Accounts</h2>
            <AccountList accounts={archivedAccounts} isArchived />
          </div>
        )}
      </div>
    </PageTransition>
  )
}
