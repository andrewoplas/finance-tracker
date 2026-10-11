import Link from "next/link";
import { TransactionExport } from "@/components/settings/transaction-export";
import { PageHeading } from "@/components/layout/page-heading";
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';
import { SmsWorkspace } from "@/components/sms/sms-workspace"
import { TagManager } from "@/components/settings/tag-manager"
import { createClient } from '@/lib/supabase/server'
import { ThemePicker } from '@/components/theme-picker'
import { CategoryManager } from '@/components/settings/category-manager'
import { ProfileSettings } from '@/components/settings/profile-settings'
import { SettingsHeading } from '@/components/settings/settings-heading'
import { ArrowUpRight } from 'lucide-react'

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
    <div className="brand-page settings-page">
      <PageHeading title="Settings" description="Make Finance work for you. Manage your profile, preferences, and connections." />

      <nav className="settings-nav" aria-label="Settings sections">
        <a href="#preferences">Personal</a><a href="#organization">Organization</a><a href="#connections">Connections</a><a href="#data">Data & export</a>
      </nav>
      <section id="preferences" className="settings-group" aria-labelledby="preferences-title">
        <div className="settings-group-heading"><h2 id="preferences-title">Personal</h2><p>Your profile and how Finance looks.</p></div>
        <ProfileSettings profile={profile} userEmail={user?.email || ''} />
        <section className="surface"><SettingsHeading icon="appearance" title="Appearance" description="Choose a theme or follow your device. Saved on this browser." /><ThemePicker /></section>
      </section>
      <section id="organization" className="settings-group" aria-labelledby="organization-title">
        <div className="settings-group-heading"><h2 id="organization-title">Organization</h2><p>Keep your accounts and transactions organized.</p></div>
        <section className="surface"><SettingsHeading icon="accounts" title="Accounts" description="Manage your bank, cash, and card balances." /><Link className="text-button settings-link" href="/dashboard/accounts">Manage accounts <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
        <CategoryManager categories={categories || []} />
        <TagManager tags={tags.error || (tags.data?.length ?? 0)>500 ? [] : tags.data ?? []} available={!tags.error && (tags.data?.length ?? 0)<=500} />
      </section>
      <section id="connections" className="settings-group" aria-labelledby="connections-title">
        <div className="settings-group-heading"><h2 id="connections-title">Connections</h2><p>Connect a shortcut or assistant. Each connection uses its own access key.</p></div>
        <div id="transaction-api" className="surface"><SmsWorkspace setup /></div>
        <div id="assistant-quick-log" className="surface"><QuickLogWorkspace setup /></div>
      </section>
      {user && <section id="data" className="settings-group" aria-labelledby="data-title">
        <div className="settings-group-heading"><h2 id="data-title">Data & export</h2><p>Take a copy of your transactions with you.</p></div>
        <TransactionExport userId={user.id} />
      </section>}
    </div>
  )
}
