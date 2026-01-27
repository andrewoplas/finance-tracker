'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Account, Category } from '@/types/database'

interface TransactionFiltersProps {
  accounts: Account[]
  categories: Category[]
  onFilterChange: (filters: FilterState) => void
}

export interface FilterState {
  search: string
  accountId: string
  categoryId: string
  type: string
  dateFrom: string
  dateTo: string
}

const ALL_VALUE = 'all'

export function TransactionFilters({ accounts, categories, onFilterChange }: TransactionFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    accountId: '',
    categoryId: '',
    type: '',
    dateFrom: '',
    dateTo: '',
  })

  const updateFilter = (key: keyof FilterState, value: string) => {
    // Convert 'all' back to empty string for filtering logic
    const actualValue = value === ALL_VALUE ? '' : value
    const newFilters = { ...filters, [key]: actualValue }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const clearFilters = () => {
    const emptyFilters: FilterState = {
      search: '',
      accountId: '',
      categoryId: '',
      type: '',
      dateFrom: '',
      dateTo: '',
    }
    setFilters(emptyFilters)
    onFilterChange(emptyFilters)
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Select value={filters.type || ALL_VALUE} onValueChange={(v) => updateFilter('type', v)}>
          <SelectTrigger>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.accountId || ALL_VALUE} onValueChange={(v) => updateFilter('accountId', v)}>
          <SelectTrigger>
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.icon} {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.categoryId || ALL_VALUE} onValueChange={(v) => updateFilter('categoryId', v)}>
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.icon} {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Input
            type="date"
            placeholder="From"
            value={filters.dateFrom}
            onChange={(e) => updateFilter('dateFrom', e.target.value)}
          />
        </div>
        <div>
          <Input
            type="date"
            placeholder="To"
            value={filters.dateTo}
            onChange={(e) => updateFilter('dateTo', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
