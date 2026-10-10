'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ACCOUNT_TYPES } from '@/lib/constants'
import { AccountType } from '@/types/database'
import { useRouter } from 'next/navigation'

export function AddAccountButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [balance, setBalance] = useState('')

  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const accountType = ACCOUNT_TYPES.find((t) => t.value === type)

    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name,
      type,
      balance: parseFloat(balance) || 0,
      opening_balance_unknown: balance.trim() === "",
      icon: accountType?.icon,
    })

    if (error) {
      toast.error('Failed to create account')
      setLoading(false)
      return
    }

    toast.success('Account created!')
    setOpen(false)
    resetForm()
    router.refresh()
  }

  const resetForm = () => {
    setName('')
    setType('cash')
    setBalance('')
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
          <DialogDescription>Add an account and its opening balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder="e.g., My Wallet, BDO Savings"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((accountType) => (
                  <SelectItem key={accountType.value} value={accountType.value}>
                    {accountType.icon} {accountType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance">Verified opening balance (optional)</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              placeholder="Leave blank if unknown"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating...' : 'Create account'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
