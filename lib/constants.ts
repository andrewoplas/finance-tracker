import { AccountType, CategoryType } from '@/types/database'

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'bank', label: 'Bank Account', icon: '🏦' },
  { value: 'e-wallet', label: 'E-Wallet', icon: '📱' },
  { value: 'credit-card', label: 'Credit Card', icon: '💳' },
  { value: 'savings', label: 'Savings', icon: '🐷' },
  { value: 'investment', label: 'Investment', icon: '📈' },
]

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Dining', icon: '🍔', color: '#ef4444' },
  { name: 'Transportation', icon: '🚗', color: '#f97316' },
  { name: 'Groceries', icon: '🛒', color: '#84cc16' },
  { name: 'Entertainment', icon: '🎮', color: '#8b5cf6' },
  { name: 'Utilities', icon: '💡', color: '#eab308' },
  { name: 'Rent / Housing', icon: '🏠', color: '#6366f1' },
  { name: 'Health', icon: '🏥', color: '#ec4899' },
  { name: 'Shopping', icon: '👕', color: '#14b8a6' },
  { name: 'Subscriptions', icon: '📱', color: '#f43f5e' },
  { name: 'Education', icon: '📚', color: '#0ea5e9' },
  { name: 'Travel', icon: '✈️', color: '#06b6d4' },
  { name: 'Gifts', icon: '🎁', color: '#d946ef' },
  { name: 'Fees & Charges', icon: '💳', color: '#64748b' },
  { name: 'Other Expense', icon: '💰', color: '#78716c' },
]

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💼', color: '#22c55e' },
  { name: 'Freelance', icon: '💻', color: '#10b981' },
  { name: 'Investments', icon: '📈', color: '#059669' },
  { name: 'Gifts Received', icon: '🎁', color: '#34d399' },
  { name: 'Other Income', icon: '💵', color: '#6ee7b7' },
]

export const CURRENCY_SYMBOL = '₱'

export const formatCurrency = (amount: number): string => {
  return `${CURRENCY_SYMBOL}${Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
