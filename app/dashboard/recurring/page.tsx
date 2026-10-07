import { PlannedItems } from "@/components/recurring/planned-items"
import { createClient } from '@/lib/supabase/server'
import { RecurringList } from '@/components/recurring/recurring-list'
import { AddRecurringButton } from '@/components/recurring/add-recurring-button'

export default async function RecurringPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: recurring } = await supabase
    .from('recurring_transactions')
    .select(`
      *,
      account:accounts(name, icon),
      category:categories(name, icon, color)
    `)
    .eq('user_id', user?.id)
    .order('next_date')

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Recurring Transactions</h1>
          <p className="text-gray-500">Automate your regular income and expenses</p>
        </div>
        <AddRecurringButton />
      </div>

      <PlannedItems />
      <RecurringList recurring={recurring || []} />
    </div>
  )
}
