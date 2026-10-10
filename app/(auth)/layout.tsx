import Link from 'next/link';
import { BrandLogo } from '@/components/layout/brand-logo';

export const dynamic = 'force-dynamic';
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <Link href="/login" className="auth-wordmark" aria-label="Finance sign in"><BrandLogo /></Link>
      {children}
      <p className="auth-footer">Your money. Your plans. One clear view.</p>
    </main>
  );
}
