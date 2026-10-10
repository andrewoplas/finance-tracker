import Link from 'next/link';
import { BrandLogo } from '@/components/layout/brand-logo';

export default function NotFound() {
  return <main className="auth-shell">
    <BrandLogo />
    <section className="surface status-page">
      <span className="eyebrow">404</span>
      <h1>Page not found</h1>
      <p>This page may have moved. Return to your workspace to continue.</p>
      <Link className="solid-button" href="/dashboard">Back to overview</Link>
    </section>
  </main>;
}
