import { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from './constants'

export async function initializeUserData(supabase: SupabaseClient, userId: string) {
  // Check if user already has categories
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (existingCategories && existingCategories.length > 0) {
    // User already has categories, skip initialization
    return
  }

  // Create default expense categories
  const expenseCategories = DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
    user_id: userId,
    name: cat.name,
    type: 'expense' as const,
    icon: cat.icon,
    color: cat.color,
    is_system: true,
  }))

  // Create default income categories
  const incomeCategories = DEFAULT_INCOME_CATEGORIES.map((cat) => ({
    user_id: userId,
    name: cat.name,
    type: 'income' as const,
    icon: cat.icon,
    color: cat.color,
    is_system: true,
  }))

  // Insert all categories
  await supabase
    .from('categories')
    .insert([...expenseCategories, ...incomeCategories])
}
