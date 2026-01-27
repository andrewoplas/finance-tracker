'use server'

import { createClient } from '@/lib/supabase/server'

export interface FrequentTransaction {
  description: string
  amount: number
  type: 'income' | 'expense' | 'transfer'
  category_id: string | null
  category_name: string | null
  category_icon: string | null
  category_color: string | null
  account_id: string | null
  account_name: string | null
  frequency: number
}

export async function getFrequentTransactions(limit = 5): Promise<FrequentTransaction[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  // Get transactions from the last 60 days
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      description,
      amount,
      type,
      category_id,
      account_id
    `)
    .eq('user_id', user.id)
    .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (!transactions || transactions.length === 0) return []

  // Group by description + amount + category + type (similar transactions)
  const groupedMap = new Map<string, {
    transaction: typeof transactions[0]
    count: number
  }>()

  for (const tx of transactions) {
    // Skip transfers for quick log (they need to_account)
    if (tx.type === 'transfer') continue
    
    // Create a key for grouping
    const key = `${tx.description}_${tx.amount}_${tx.type}_${tx.category_id}`
    
    if (groupedMap.has(key)) {
      groupedMap.get(key)!.count++
    } else {
      groupedMap.set(key, { transaction: tx, count: 1 })
    }
  }

  // Get category and account details for the frequent transactions
  const categoryIds = Array.from(new Set(
    Array.from(groupedMap.values())
      .map(({ transaction }) => transaction.category_id)
      .filter((id): id is string => id !== null)
  ))

  const accountIds = Array.from(new Set(
    Array.from(groupedMap.values())
      .map(({ transaction }) => transaction.account_id)
      .filter((id): id is string => id !== null)
  ))

  const [categoriesRes, accountsRes] = await Promise.all([
    categoryIds.length > 0
      ? supabase.from('categories').select('id, name, icon, color').in('id', categoryIds)
      : Promise.resolve({ data: [] }),
    accountIds.length > 0
      ? supabase.from('accounts').select('id, name').in('id', accountIds)
      : Promise.resolve({ data: [] })
  ])

  const categoriesMap = new Map(
    (categoriesRes.data || []).map(c => [c.id, c])
  )
  const accountsMap = new Map(
    (accountsRes.data || []).map(a => [a.id, a])
  )

  // Convert to array and sort by frequency
  const frequent = Array.from(groupedMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ transaction, count }) => {
      const category = transaction.category_id ? categoriesMap.get(transaction.category_id) : null
      const account = transaction.account_id ? accountsMap.get(transaction.account_id) : null

      return {
        description: transaction.description,
        amount: Number(transaction.amount),
        type: transaction.type,
        category_id: transaction.category_id,
        category_name: category?.name || null,
        category_icon: category?.icon || null,
        category_color: category?.color || null,
        account_id: transaction.account_id,
        account_name: account?.name || null,
        frequency: count
      }
    })

  return frequent
}
