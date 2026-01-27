import { createClient } from '@/lib/supabase/server'
import { WalletList } from '@/components/wallets/wallet-list'
import { AddWalletButton } from '@/components/wallets/add-wallet-button'
import { formatCurrency } from '@/lib/constants'
import { Briefcase } from 'lucide-react'
import { PageTransition } from '@/components/ui/page-transition'

export default async function WalletsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [walletsRes, accountsRes] = await Promise.all([
    supabase.from('wallets').select('*').eq('user_id', user?.id).order('created_at'),
    supabase.from('accounts').select('balance').eq('user_id', user?.id).eq('is_archived', false),
  ])

  const wallets = walletsRes.data || []
  const totalAccountBalance = accountsRes.data?.reduce((sum, acc) => sum + Number(acc.balance), 0) || 0
  const totalWalletBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0)

  return (
    <PageTransition>
      <div className="space-y-6 md:space-y-8 px-4 md:px-0 py-6 md:py-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Wallets</h1>
          <div className="flex items-center gap-2 mt-1">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Allocated: <span className="font-semibold text-foreground">{formatCurrency(totalWalletBalance)}</span>
              <span className="mx-2 text-border">•</span>
              <span className="text-sm">Total Available: {formatCurrency(totalAccountBalance)}</span>
            </p>
          </div>
        </div>
        <AddWalletButton />
      </div>

        {/* Wallet List */}
        <WalletList wallets={wallets} totalBalance={totalAccountBalance} />
      </div>
    </PageTransition>
  )
}
