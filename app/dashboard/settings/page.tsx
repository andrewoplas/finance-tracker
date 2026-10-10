import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';
import { SmsWorkspace } from "@/components/sms/sms-workspace"
import { TagManager } from "@/components/settings/tag-manager"
import { createClient } from '@/lib/supabase/server'
import { ThemePicker } from '@/components/theme-picker'
import { CategoryManager } from '@/components/settings/category-manager'
import { ProfileSettings } from '@/components/settings/profile-settings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user?.id)
    .single()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)
    .order('type')
    .order('name')

  const tags = await supabase.from("tags").select("id,name").eq("user_id", user?.id).order("name").limit(501)

  return (
    <div className="brand-page settings-page space-y-6">
      <PageHeading title="Settings" description="Make Finance work for you. Manage your profile, preferences, and connections." />

      <section className="surface"><h2>Appearance</h2><p className="muted">Choose a theme or follow your device. Saved on this browser.</p><ThemePicker /></section>

      <section className="surface"><h2>Accounts</h2><p className="muted">Manage your bank, cash, and card balances.</p><Link className="text-button" href="/dashboard/accounts">Manage accounts →</Link></section>
      <ProfileSettings profile={profile} userEmail={user?.email || ''} />

      <section id="transaction-api" className="surface"><SmsWorkspace setup /><QuickLogWorkspace setup /></section>

      <TagManager tags={tags.error || (tags.data?.length ?? 0)>500 ? [] : tags.data ?? []} available={!tags.error && (tags.data?.length ?? 0)<=500} />
      <CategoryManager categories={categories || []} />
    </div>
  )
}
