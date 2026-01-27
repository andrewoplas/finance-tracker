import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { WalletList } from '@/components/wallets/wallet-list'
import { AddWalletButton } from '@/components/wallets/add-wallet-button'
import { formatCurrency } from '@/lib/constants'

export default async function WalletsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: wallets } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at')

  const totalBalance = wallets?.reduce((sum, w) => sum + Number(w.balance), 0) || 0

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Wallets</h1>
          <p className="text-gray-500">Total: {formatCurrency(totalBalance)}</p>
        </div>
        <AddWalletButton />
      </div>

      {wallets && wallets.length > 0 ? (
        <WalletList wallets={wallets} />
      ) : (
        <Card className="p-12 text-center text-gray-500">
          <p className="mb-4">No wallets yet. Create your first wallet!</p>
          <p className="text-sm">💡 Wallets help you allocate money by purpose (Life, Play, Growth)</p>
        </Card>
      )}
    </div>
  )
}
