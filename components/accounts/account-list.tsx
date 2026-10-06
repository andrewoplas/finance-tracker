'use client'

import { Account } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, ACCOUNT_TYPES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
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
import { EditAccountDialog } from './edit-account-dialog'
import { cn } from '@/lib/utils'

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
    if (!confirm('Delete this empty account? Accounts with ledger history must be archived instead.')) {
      return
    }

    const { error } = await supabase.from('accounts').delete().eq('id', account.id)

    if (error) {
      toast.error('Could not delete. Archive accounts with history instead.')
      return
    }

    toast.success('Account deleted')
    router.refresh()
  }

  if (accounts.length === 0) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {isArchived ? 'No archived accounts' : 'No accounts yet'}
          </h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {isArchived ? 'Archived accounts will appear here' : 'Add your first account to start tracking your finances'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((account) => {
          const accountType = ACCOUNT_TYPES.find((t) => t.value === account.type)
          const balance = Number(account.balance)
          const isNegative = balance < 0
          
          return (
            <Card 
              key={account.id} 
              className={cn(
                "group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
                isArchived && "opacity-60 hover:opacity-80"
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center text-2xl transition-transform duration-200 group-hover:scale-105">
                      {account.icon || accountType?.icon || '💳'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{account.name}</h3>
                      <p className="text-sm text-muted-foreground">{accountType?.label}</p>
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
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => setEditingAccount(account)} className="cursor-pointer">
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(account)} className="cursor-pointer">
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
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(account)}
                        className="text-destructive focus:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{account.opening_balance===null?'Balance · needs reconciliation':'Ledger balance'}</p>
                    <p className={cn(
                      "text-2xl font-bold tabular-nums",
                      isNegative ? 'text-expense' : 'text-foreground'
                    )}>
                      {account.opening_balance === null ? 'Unknown' : formatCurrency(balance)}
                    </p>
                  </div>
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center",
                    isNegative ? "bg-expense/10" : "bg-income/10"
                  )}>
                    {isNegative ? (
                      <TrendingDown className="h-4 w-4 text-expense" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-income" />
                    )}
                  </div>
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
