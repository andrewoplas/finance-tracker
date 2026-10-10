import { PageHeading } from "@/components/layout/page-heading";
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/constants'
import { AccountList } from '@/components/accounts/account-list'
import { AddAccountButton } from '@/components/accounts/add-account-button'
import { PageTransition } from '@/components/ui/page-transition'
import { Wallet } from 'lucide-react'

export default async function AccountsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: true })

  if(error||!user)return <div className="surface" role="alert"><h2>Accounts could not load</h2><p>Your balances have not been replaced with zero.</p><a href="/dashboard/accounts">Retry</a></div>
  const activeAccounts = accounts?.filter(a => !a.is_archived) || []
  const archivedAccounts = accounts?.filter(a => a.is_archived) || []
  const totalBalance = activeAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0)

  return (
    <PageTransition>
      <div className="brand-page space-y-6">
      {/* Header */}
      <PageHeading title="Accounts" description={
        <div className="flex items-center gap-2 mt-1">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {activeAccounts.some(a=>a.opening_balance===null)?'Balance total:':'Ledger balance total:'} <span className="font-semibold text-foreground">{activeAccounts.some(a=>a.opening_balance===null) ? 'Unknown' : formatCurrency(totalBalance)}</span>
            </p>
          </div>
      } action={<AddAccountButton />} />

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
