import { PlannedItems } from '@/components/recurring/planned-items';
import { PlanningTabs } from "@/components/layout/planning-tabs";
import { PageHeading } from "@/components/layout/page-heading";
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
    <div className="brand-page space-y-6">
      <PlanningTabs />
      <PageHeading title="Recurring" description="Track repeating income and expenses. Post each occurrence when you’re ready." action={<AddRecurringButton />} />

      <RecurringList recurring={recurring || []} />
      <PlannedItems />
    </div>
  )
}
