'use client'

import { createEntries } from '@/lib/finance/client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Loader2, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  AlertCircle,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'

interface ParsedTransaction {
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  categoryName: string | null
  categoryId: string | null
  accountName: string | null
  accountId: string | null
  toAccountName: string | null
  toAccountId: string | null
  date: string
  confidence: number
}

interface Category {
  id: string
  name: string
  type: string
  icon: string
}

interface Account {
  id: string
  name: string
  icon: string
}

type DialogState = 'input' | 'parsing' | 'editing' | 'summary' | 'saving' | 'error'

const transactionTypes = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, color: 'text-expense bg-expense/10 border-expense/30' },
  { value: 'income', label: 'Income', icon: ArrowDownRight, color: 'text-income bg-income/10 border-income/30' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'text-transfer bg-transfer/10 border-transfer/30' },
]

const exampleInputs = [
  "Spent 250 on Jollibee",
  "Received 50000 salary",
  "Paid 1500 for electricity",
  "Transferred 10k to savings",
  "250 lunch, 120 coffee, 500 grab",
]

interface AiTransactionDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function AiTransactionDialog({ 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange 
}: AiTransactionDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  
  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const [state, setState] = useState<DialogState>('input')
  const [inputText, setInputText] = useState('')
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()
  const router = useRouter()

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setState('input')
        setInputText('')
        setTransactions([])
        setCurrentIndex(0)
        setError(null)
      }, 200)
    }
  }, [open])

  const parseInput = async () => {
    if (!inputText.trim()) return

    setState('parsing')
    setError(null)

    try {
      const response = await fetch('/api/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse')
      }

      if (!data.transactions || data.transactions.length === 0) {
        throw new Error('Could not understand the transaction. Please try again.')
      }

      setTransactions(data.transactions)
      setCategories(data.categories || [])
      setAccounts(data.accounts || [])
      setCurrentIndex(0)
      setState('editing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setState('error')
    }
  }

  const updateTransaction = (index: number, updates: Partial<ParsedTransaction>) => {
    setTransactions(prev => prev.map((t, i) => 
      i === index ? { ...t, ...updates } : t
    ))
  }

  const currentTransaction = transactions[currentIndex]
  const isLastTransaction = currentIndex === transactions.length - 1
  const isFirstTransaction = currentIndex === 0

  const goNext = () => {
    if (isLastTransaction) {
      setState('summary')
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const goBack = () => {
    if (state === 'summary') {
      setState('editing')
      setCurrentIndex(transactions.length - 1)
    } else if (!isFirstTransaction) {
      setCurrentIndex(prev => prev - 1)
    }
  }

  const saveAllTransactions = async () => {
    setState('saving')
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Validate all transactions have required fields
      for (const t of transactions) {
        if (!t.accountId) {
          throw new Error('Please select an account for all transactions')
        }
        if (t.type === 'transfer' && !t.toAccountId) {
          throw new Error('Please select destination account for transfers')
        }
      }

      // Insert all transactions
      const inserts = transactions.map(t => ({
        user_id: user.id,
        account_id: t.accountId,
        category_id: t.type === 'transfer' ? null : t.categoryId,
        type: t.type,
        amount: t.amount,
        description: t.description || null,
        date: t.date,
        to_account_id: t.type === 'transfer' ? t.toAccountId : null,
      }))

      const { error: insertError } = await createEntries(inserts)

      if (insertError) {
        throw insertError
      }

      toast.success(`Added ${transactions.length} transaction${transactions.length > 1 ? 's' : ''}!`)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed')
      setState('summary')
    }
  }

  const filteredCategories = categories.filter(c => 
    currentTransaction?.type === 'transfer' ? false : c.type === currentTransaction?.type
  )

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button className="gap-2 ">
          <Wand2 className="h-4 w-4" />
          <span className="hidden sm:inline">Smart Add</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {state === 'input' && 'Add Transaction'}
            {state === 'parsing' && 'Understanding...'}
            {state === 'editing' && `Transaction ${currentIndex + 1} of ${transactions.length}`}
            {state === 'summary' && 'Review & Save'}
            {state === 'saving' && 'Saving...'}
            {state === 'error' && 'Oops!'}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {/* INPUT STATE */}
        {state === 'input' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Describe your transaction(s)</Label>
              <Textarea
                placeholder="e.g., Spent 250 on Jollibee"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[100px] text-base rounded-xl resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    parseInput()
                  }
                }}
              />
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">💡 Try:</p>
              <div className="flex flex-wrap gap-2">
                {exampleInputs.slice(0, 3).map((example) => (
                  <button
                    key={example}
                    onClick={() => setInputText(example)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={parseInput} 
              className="w-full h-12 rounded-xl font-semibold "
              disabled={!inputText.trim()}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Parse Transaction
            </Button>
          </div>
        )}

        {/* PARSING STATE */}
        {state === 'parsing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Understanding your transaction...</p>
          </div>
        )}

        {/* ERROR STATE */}
        {state === 'error' && (
          <div className="py-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Couldn&apos;t parse that</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button onClick={() => setState('input')} variant="outline" className="rounded-xl">
              Try Again
            </Button>
          </div>
        )}

        {/* EDITING STATE */}
        {state === 'editing' && currentTransaction && (
          <div className="space-y-4 pt-2">
            {/* Confidence indicator */}
            {currentTransaction.confidence < 0.8 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/10 text-warning-foreground text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Please verify - AI is {Math.round(currentTransaction.confidence * 100)}% confident</span>
              </div>
            )}

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              {transactionTypes.map((t) => {
                const Icon = t.icon
                const isActive = currentTransaction.type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => updateTransaction(currentIndex, { 
                      type: t.value as 'income' | 'expense' | 'transfer',
                      categoryId: null,
                      categoryName: null,
                    })}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all duration-200",
                      isActive 
                        ? t.color + " border-current" 
                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Amount</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  value={currentTransaction.amount}
                  onChange={(e) => updateTransaction(currentIndex, { amount: parseFloat(e.target.value) || 0 })}
                  className="pl-10 text-xl font-semibold h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Account */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {currentTransaction.type === 'transfer' ? 'From' : 'Account'}
                </Label>
                <Select 
                  value={currentTransaction.accountId || undefined} 
                  onValueChange={(v) => updateTransaction(currentIndex, { accountId: v })}
                >
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

              {/* To Account (transfer) or Category */}
              {currentTransaction.type === 'transfer' ? (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">To</Label>
                  <Select 
                    value={currentTransaction.toAccountId || undefined} 
                    onValueChange={(v) => updateTransaction(currentIndex, { toAccountId: v })}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter(a => a.id !== currentTransaction.accountId)
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
                  <Select 
                    value={currentTransaction.categoryId || undefined} 
                    onValueChange={(v) => updateTransaction(currentIndex, { categoryId: v })}
                  >
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
                <Label className="text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={currentTransaction.date}
                  onChange={(e) => updateTransaction(currentIndex, { date: e.target.value })}
                  className="h-11 rounded-xl"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Note</Label>
                <Input
                  placeholder="Optional"
                  value={currentTransaction.description}
                  onChange={(e) => updateTransaction(currentIndex, { description: e.target.value })}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              {!isFirstTransaction && (
                <Button onClick={goBack} variant="outline" className="flex-1 h-11 rounded-xl">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <Button onClick={goNext} className="flex-1 h-11 rounded-xl font-semibold ">
                {isLastTransaction ? (
                  transactions.length > 1 ? 'Review All' : 'Save'
                ) : 'Next'}
                {!isLastTransaction && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </div>
          </div>
        )}

        {/* SUMMARY STATE */}
        {state === 'summary' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              {transactions.map((t, i) => {
                const typeConfig = transactionTypes.find(tt => tt.value === t.type)
                const Icon = typeConfig?.icon || ArrowUpRight
                const account = accounts.find(a => a.id === t.accountId)
                const category = categories.find(c => c.id === t.categoryId)
                
                return (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-3 rounded-xl bg-accent/50 hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => { setCurrentIndex(i); setState('editing') }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center",
                        t.type === 'income' && "bg-income/15 text-income",
                        t.type === 'expense' && "bg-expense/15 text-expense",
                        t.type === 'transfer' && "bg-transfer/15 text-transfer"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {t.description || category?.name || 'Transaction'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account?.name || 'No account'} • {t.date}
                        </p>
                      </div>
                    </div>
                    <p className={cn(
                      "font-semibold tabular-nums",
                      t.type === 'income' && 'text-income',
                      t.type === 'expense' && 'text-expense',
                      t.type === 'transfer' && 'text-transfer'
                    )}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                      {formatCurrency(t.amount)}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Total */}
            {transactions.length > 1 && (
              <div className="flex justify-between items-center p-3 rounded-xl bg-primary/5 border border-primary/20">
                <span className="font-medium text-foreground">Total</span>
                <span className="font-bold tabular-nums">
                  {formatCurrency(transactions.reduce((sum, t) => {
                    if (t.type === 'expense') return sum - t.amount
                    if (t.type === 'income') return sum + t.amount
                    return sum
                  }, 0))}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={goBack} variant="outline" className="flex-1 h-11 rounded-xl">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button 
                onClick={saveAllTransactions} 
                className="flex-1 h-11 rounded-xl font-semibold "
              >
                <Check className="h-4 w-4 mr-2" />
                Save {transactions.length > 1 ? `All (${transactions.length})` : ''}
              </Button>
            </div>
          </div>
        )}

        {/* SAVING STATE */}
        {state === 'saving' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Saving transactions...</p>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
