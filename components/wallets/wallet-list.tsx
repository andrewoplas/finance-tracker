'use client'

import { Wallet } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Trash2, Plus, Minus, Sparkles, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { cn } from '@/lib/utils'

interface WalletListProps {
  wallets: Wallet[]
  totalBalance?: number
}

function CircularProgress({ 
  percentage, 
  color, 
  size = 120, 
  strokeWidth = 8 
}: { 
  percentage: number
  color: string
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/30"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500 ease-out"
      />
    </svg>
  )
}

export function WalletList({ wallets, totalBalance = 0 }: WalletListProps) {
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

  if (wallets.length === 0) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No wallets yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Create wallets to organize your money into different purposes (e.g., Life, Play, Growth)
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {wallets.map((wallet) => {
          const targetPercentage = wallet.target_percentage || 0
          const balance = Number(wallet.balance)
          const targetAmount = totalBalance * (targetPercentage / 100)
          const progressPercentage = targetAmount > 0 ? (balance / targetAmount) * 100 : 0
          const walletColor = wallet.color || '#f97316'
          
          return (
            <Card 
              key={wallet.id} 
              className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-11 w-11 rounded-xl flex items-center justify-center text-xl transition-transform duration-200 group-hover:scale-105"
                      style={{ backgroundColor: `${walletColor}20` }}
                    >
                      {wallet.icon || '💰'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{wallet.name}</h3>
                      {targetPercentage > 0 && (
                        <p className="text-xs text-muted-foreground">Target: {targetPercentage}% of total</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem 
                        onClick={() => { setAdjustWallet(wallet); setAdjustType('add'); }}
                        className="cursor-pointer"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Money
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => { setAdjustWallet(wallet); setAdjustType('subtract'); }}
                        className="cursor-pointer"
                      >
                        <Minus className="h-4 w-4 mr-2" />
                        Remove Money
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(wallet)}
                        className="text-destructive focus:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Circular Progress */}
                {targetPercentage > 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="relative">
                      <CircularProgress 
                        percentage={progressPercentage} 
                        color={walletColor}
                        size={140}
                        strokeWidth={10}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span 
                          className="text-2xl font-bold tabular-nums"
                          style={{ color: walletColor }}
                        >
                          {Math.round(progressPercentage)}%
                        </span>
                        <span className="text-xs text-muted-foreground">of target</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Balance */}
                <div className={cn("text-center", !targetPercentage && "pt-4")}>
                  <p 
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: walletColor }}
                  >
                    {formatCurrency(balance)}
                  </p>
                  {targetPercentage > 0 && targetAmount > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Target: {formatCurrency(targetAmount)}
                    </p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 rounded-lg"
                    onClick={() => { setAdjustWallet(wallet); setAdjustType('add'); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 rounded-lg"
                    onClick={() => { setAdjustWallet(wallet); setAdjustType('subtract'); }}
                  >
                    <Minus className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {adjustWallet && (
        <Dialog open={!!adjustWallet} onOpenChange={(open) => !open && setAdjustWallet(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span 
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-lg"
                  style={{ backgroundColor: `${adjustWallet.color || '#f97316'}20` }}
                >
                  {adjustWallet.icon || '💰'}
                </span>
                {adjustType === 'add' ? 'Add to' : 'Remove from'} {adjustWallet.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              <div className="p-4 rounded-xl bg-accent/50">
                <p className="text-sm text-muted-foreground mb-1">Current balance</p>
                <p 
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: adjustWallet.color || '#f97316' }}
                >
                  {formatCurrency(Number(adjustWallet.balance))}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-muted-foreground">Amount to {adjustType}</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">₱</span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="pl-10 text-xl font-semibold h-12 rounded-xl"
                    autoFocus
                  />
                </div>
              </div>
              <Button 
                onClick={handleAdjust} 
                className="w-full h-12 rounded-xl font-semibold shadow-lg shadow-primary/25" 
                disabled={loading || !adjustAmount}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adjusting...
                  </>
                ) : (
                  adjustType === 'add' ? 'Add Money' : 'Remove Money'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
