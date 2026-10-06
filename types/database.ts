export type AccountType = 'cash' | 'bank' | 'e-wallet' | 'credit-card' | 'savings' | 'investment'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type CategoryType = 'income' | 'expense'

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly'

export interface Profile {
  id: string
  display_name: string | null
  currency: string
  created_at: string
}

export interface Account {
  opening_balance: number | null
  revision: number
  id: string
  user_id: string
  name: string
  type: AccountType
  balance: number
  icon: string | null
  color: string | null
  is_archived: boolean
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  type: CategoryType
  icon: string | null
  color: string | null
  is_system: boolean
  created_at: string
}

export interface Transaction {
  revision: number
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TransactionType
  amount: number
  description: string | null
  date: string
  time: string | null
  to_account_id: string | null
  receipt_url: string | null
  is_recurring: boolean
  recurring_id: string | null
  wallet_id: string | null
  created_at: string
  // Joined fields
  account?: Account
  category?: Category
  to_account?: Account
  wallet?: Wallet
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  period: BudgetPeriod
  start_date: string | null
  rollover: boolean
  created_at: string
  // Joined fields
  category?: Category
}

export interface RecurringTransaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TransactionType
  amount: number
  description: string | null
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  next_date: string
  is_active: boolean
  created_at: string
  // Joined fields
  account?: Account
  category?: Category
}

export interface Wallet {
  opening_balance: number | null
  revision: number
  id: string
  user_id: string
  name: string
  icon: string | null
  color: string | null
  target_percentage: number | null
  balance: number
  created_at: string
}

// Form types
export interface AccountFormData {
  name: string
  type: AccountType
  balance: number
  icon?: string
  color?: string
}

export interface TransactionFormData {
  account_id: string
  category_id?: string
  type: TransactionType
  amount: number
  description?: string
  date: string
  time?: string
  to_account_id?: string
}

export interface CategoryFormData {
  name: string
  type: CategoryType
  icon?: string
  color?: string
}

export interface BudgetFormData {
  category_id: string
  amount: number
  period: BudgetPeriod
  rollover?: boolean
}
