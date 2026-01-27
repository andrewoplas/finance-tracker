'use client'

import { Wallet } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Trash2, Plus, Minus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WalletListProps {
  wallets: Wallet[]
}

export function WalletList({ wallets }: WalletListProps) {
  const [adjustWallet, setAdjustWallet] = useState<Wallet | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add')
  const [loading, setLoading] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const handleDelete = async (wallet: Wallet) => {
    if (!confirm(`Delete "${wallet.name}"? This cannot be undone.`)) {
      return
    }

    const { error } = await supabase.from('wallets').delete().eq('id', wallet.id)

    if (error) {
      toast.error('Failed to delete wallet')
      return
    }

    toast.success('Wallet deleted')
    router.refresh()
  }

  const handleAdjust = async () => {
    if (!adjustWallet || !adjustAmount) return

    setLoading(true)
    const amount = parseFloat(adjustAmount)
    const newBalance = adjustType === 'add' 
      ? Number(adjustWallet.balance) + amount
      : Number(adjustWallet.balance) - amount

    const { error } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', adjustWallet.id)

    if (error) {
      toast.error('Failed to adjust wallet')
      setLoading(false)
      return
    }

    toast.success('Wallet adjusted!')
    setAdjustWallet(null)
    setAdjustAmount('')
    setLoading(false)
    router.refresh()
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.map((wallet) => {
          const targetPercentage = wallet.target_percentage || 0
          return (
            <Card key={wallet.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="text-3xl w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${wallet.color}20` }}
                    >
                      {wallet.icon || '💰'}
                    </div>
                    <div>
                      <h3 className="font-semibold">{wallet.name}</h3>
                      {targetPercentage > 0 && (
                        <p className="text-sm text-gray-500">Target: {targetPercentage}%</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setAdjustWallet(wallet); setAdjustType('add'); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Money
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setAdjustWallet(wallet); setAdjustType('subtract'); }}>
                        <Minus className="h-4 w-4 mr-2" />
                        Remove Money
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(wallet)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold" style={{ color: wallet.color || '#000' }}>
                    {formatCurrency(Number(wallet.balance))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {adjustWallet && (
        <Dialog open={!!adjustWallet} onOpenChange={(open) => !open && setAdjustWallet(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {adjustType === 'add' ? 'Add' : 'Remove'} Money - {adjustWallet.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Current balance</p>
                <p className="text-xl font-bold">{formatCurrency(Number(adjustWallet.balance))}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <Button onClick={handleAdjust} className="w-full" disabled={loading || !adjustAmount}>
                {loading ? 'Adjusting...' : adjustType === 'add' ? 'Add Money' : 'Remove Money'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
