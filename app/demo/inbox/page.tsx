import Link from 'next/link';
import { SmsWorkspace } from '@/components/sms/sms-workspace';
import { QuickLogWorkspace } from '@/components/sms/quick-log-workspace';
export default function DemoInbox(){return <main className="surface max-w-3xl mx-auto"><Link href="/demo">Back to demo</Link><SmsWorkspace demo/><QuickLogWorkspace demo/><SmsWorkspace demo setup/><QuickLogWorkspace demo setup/></main>;}
