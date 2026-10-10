import Link from 'next/link';
import { PageHeading } from '@/components/layout/page-heading';
import { SmsWorkspace } from '@/components/sms/sms-workspace';
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';
export default function DemoInbox() {
  return <div className="brand-page inbox-page space-y-6">
    <PageHeading title="Inbox" description="Synthetic preview · Nothing is sent or saved." action={<Link className="text-button" href="/demo">← Overview</Link>} />
    <div className="surface"><SmsWorkspace demo /></div>
    <div className="surface"><QuickLogWorkspace demo /></div>
    <div className="surface"><SmsWorkspace demo setup /></div>
    <div className="surface"><QuickLogWorkspace demo setup /></div>
  </div>;
}
