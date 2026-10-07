'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { isLocalMonthlyNavigation } from '@/lib/finance/monthly-navigation';

export function MonthlyLink({ loadedMonth, onClick, ...props }: ComponentProps<typeof Link> & { loadedMonth?: string }) {
  return <Link {...props} prefetch={false} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self') || props.download) return;
    const next = new URL(event.currentTarget.href);
    if (!isLocalMonthlyNavigation(new URL(window.location.href), next, loadedMonth)) return;
    event.preventDefault();
    window.history.pushState(null, '', next.href);
  }} />;
}
