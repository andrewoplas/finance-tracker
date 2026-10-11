import { PageHeading } from '@/components/layout/page-heading';
import { SmsWorkspace } from '@/components/sms/sms-workspace';
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';

export default function InboxPage() {
  return <div className="brand-page inbox-page space-y-6">
    <PageHeading title="Inbox" description="Review incoming purchases and possible duplicates before they count toward spending." />
    <div className="surface"><SmsWorkspace /></div>
    <div className="surface"><QuickLogWorkspace /></div>
  </div>;
}
