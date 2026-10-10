'use client'

import Link from 'next/link'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ACCOUNT_TYPES } from '@/lib/constants'
import { Account, AccountType } from '@/types/database'
import { useRouter } from 'next/navigation'

interface EditAccountDialogProps {
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditAccountDialog({ account, open, onOpenChange }: EditAccountDialogProps) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(account.name)
  const [type, setType] = useState<AccountType>(account.type)

  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const accountType = ACCOUNT_TYPES.find((t) => t.value === type)

    const { error } = await supabase
      .from('accounts')
      .update({
        name,
        type,
        icon: accountType?.icon,
      })
      .eq('id', account.id)

    if (error) {
      toast.error('Failed to update account')
      setLoading(false)
      return
    }

    toast.success('Account updated!')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Update account details. Use reconciliation to correct its balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
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

          <p className="text-sm text-muted-foreground">
            Current balance: {account.opening_balance === null ? 'Unknown' : `₱${Number(account.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {account.opening_balance === null ? 'Opening balance needs reconciliation.' : 'Balance is rebuilt from its opening baseline and ledger.'}
          </p>

          <Link className="text-button" href="/dashboard/plans#reconcile">Reconcile balance with an audit trail →</Link>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
