'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, ArrowDownRight, ArrowUpRight, ArrowLeftRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Account, Category, TransactionType, Wallet } from '@/types/database'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const transactionTypes = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, color: 'text-expense bg-expense/10 border-expense/20' },
  { value: 'income', label: 'Income', icon: ArrowDownRight, color: 'text-income bg-income/10 border-income/20' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'text-transfer bg-transfer/10 border-transfer/20' },
]

export function QuickAddTransaction() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  
  const [type, setType] = useState<TransactionType>('expense')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [walletId, setWalletId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [toAccountId, setToAccountId] = useState('')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [accountsRes, categoriesRes, walletsRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_archived', false),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('wallets').select('*').eq('user_id', user.id),
      ])

      setAccounts(accountsRes.data || [])
      setCategories(categoriesRes.data || [])
      setWallets(walletsRes.data || [])
    }

    if (open) fetchData()
  }, [open, supabase])

  const filteredCategories = categories.filter(c => c.type === type || type === 'transfer')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Validation
    if (!accountId) {
      toast.error('Please select an account')
      setLoading(false)
      return
    }

    if (type === 'transfer' && !toAccountId) {
      toast.error('Please select destination account')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: accountId,
      category_id: type === 'transfer' ? null : categoryId || null,
      wallet_id: walletId || null,
      type,
      amount: parseFloat(amount),
      description: description || null,
      date,
      to_account_id: type === 'transfer' ? toAccountId : null,
    })

    if (error) {
      toast.error('Failed to add transaction')
      setLoading(false)
      return
    }

    toast.success('Transaction added!')
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const resetForm = () => {
    setType('expense')
    setAccountId('')
    setCategoryId('')
    setWalletId('')
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().split('T')[0])
    setToAccountId('')
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Transaction</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">New Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Type Toggle */}
          <div className="grid grid-cols-3 gap-2">
            {transactionTypes.map((t) => {
              const Icon = t.icon
              const isActive = type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value as TransactionType)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200",
                    isActive 
                      ? t.color + " border-current" 
                      : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-accent"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Amount - Big and prominent */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-muted-foreground">Amount</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">₱</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-10 text-2xl font-semibold h-14 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Account */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">{type === 'transfer' ? 'From' : 'Account'}</Label>
              <Select value={accountId || undefined} onValueChange={setAccountId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.icon} {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To Account or Category */}
            {type === 'transfer' ? (
              <div className="space-y-2">
                <Label className="text-muted-foreground">To</Label>
                <Select value={toAccountId || undefined} onValueChange={setToAccountId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.icon} {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Category</Label>
                <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date" className="text-muted-foreground">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
            </div>

            {/* Wallet (only for non-transfers if wallets exist) */}
            {type !== 'transfer' && wallets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Wallet</Label>
                <Select 
                  value={walletId || undefined} 
                  onValueChange={(v) => setWalletId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {wallets.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.icon} {wallet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Fill space if no wallet */}
            {(type === 'transfer' || wallets.length === 0) && <div />}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground">Note (optional)</Label>
            <Input
              id="description"
              placeholder="What was this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/25" 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Transaction'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
