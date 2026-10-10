'use client'

import { useState, useMemo } from 'react'
import { Transaction, Account, Category } from '@/types/database'
import { TransactionFilters, FilterState } from './transaction-filters'
import { TransactionList } from './transaction-list'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { formatCurrency } from '@/lib/constants'

interface TransactionListWithFiltersProps {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}

export function TransactionListWithFilters({ 
  transactions, 
  accounts, 
  categories 
}: TransactionListWithFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    accountId: '',
    categoryId: '',
    type: '',
    dateFrom: '',
    dateTo: '',
  })

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchesDescription = t.description?.toLowerCase().includes(searchLower)
        const matchesCategory = t.category?.name?.toLowerCase().includes(searchLower)
        const matchesAccount = t.account?.name?.toLowerCase().includes(searchLower)
        const matchesAmount = t.amount?.toString().includes(searchLower) || false
        
        if (!matchesDescription && !matchesCategory && !matchesAccount && !matchesAmount) {
          return false
        }
      }

      // Type filter
      if (filters.type && t.type !== filters.type) return false

      // Account filter
      if (filters.accountId && t.account_id !== filters.accountId) return false

      // Category filter
      if (filters.categoryId && t.category_id !== filters.categoryId) return false

      // Date range filter
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo && t.date > filters.dateTo) return false

      return true
    })
  }, [transactions, filters])

  const exportToCSV = () => {
    const csvRows = [
      // Header
      ['Date', 'Type', 'Amount', 'Category', 'Account', 'Description', 'Wallet'].join(','),
      // Data rows
      ...filteredTransactions.map(t => [
        t.date,
        t.type,
        t.amount,
        t.category?.name || '',
        t.account?.name || '',
        t.description || '',
        t.wallet?.name || '',
      ].map(field => `"${field}"`).join(','))
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const stats = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    const expense = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    return { income, expense, net: income - expense }
  }, [filteredTransactions])

  return (
    <div className="space-y-4">
      <TransactionFilters
        accounts={accounts}
        categories={categories}
        onFilterChange={setFilters}
      />

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          {filteredTransactions.length > 0 && (
            <span className="ml-2">
              • Income: <span className="text-income">{formatCurrency(stats.income)}</span>
              • Expenses: <span className="text-expense">{formatCurrency(stats.expense)}</span>
              • Net: <span className={stats.net >= 0 ? 'text-income' : 'text-expense'}>
                {formatCurrency(stats.net)}
              </span>
            </span>
          )}
        </div>
        {filteredTransactions.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      <TransactionList transactions={filteredTransactions} />
    </div>
  )
}
