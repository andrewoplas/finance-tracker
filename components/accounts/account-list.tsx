'use client'

import { Account } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, ACCOUNT_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
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
import { EditAccountDialog } from './edit-account-dialog'

interface AccountListProps {
  accounts: Account[]
  isArchived?: boolean
}

export function AccountList({ accounts, isArchived = false }: AccountListProps) {
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const handleArchive = async (account: Account) => {
    const { error } = await supabase
      .from('accounts')
      .update({ is_archived: !account.is_archived })
      .eq('id', account.id)

    if (error) {
      toast.error('Failed to update account')
      return
    }

    toast.success(account.is_archived ? 'Account restored' : 'Account archived')
    router.refresh()
  }

  const handleDelete = async (account: Account) => {
    if (!confirm('Are you sure? This will delete the account and all its transactions.')) {
      return
    }

    const { error } = await supabase.from('accounts').delete().eq('id', account.id)

    if (error) {
      toast.error('Failed to delete account')
      return
    }

    toast.success('Account deleted')
    router.refresh()
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          {isArchived ? 'No archived accounts' : 'No accounts yet. Add your first one!'}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => {
          const accountType = ACCOUNT_TYPES.find((t) => t.value === account.type)
          return (
            <Card key={account.id} className={isArchived ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{account.icon || accountType?.icon || '💳'}</div>
                    <div>
                      <h3 className="font-semibold">{account.name}</h3>
                      <p className="text-sm text-gray-500">{accountType?.label}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingAccount(account)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(account)}>
                        {account.is_archived ? (
                          <>
                            <ArchiveRestore className="h-4 w-4 mr-2" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(account)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4">
                  <p className={`text-2xl font-bold ${Number(account.balance) < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(Number(account.balance))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {editingAccount && (
        <EditAccountDialog
          account={editingAccount}
          open={!!editingAccount}
          onOpenChange={(open) => !open && setEditingAccount(null)}
        />
      )}
    </>
  )
}
