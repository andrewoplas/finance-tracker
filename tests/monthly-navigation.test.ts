import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalMonthlyNavigation, isNavigableMonth, monthHref, shiftMonth } from '../lib/finance/monthly-navigation';
const url = (path: string) => new URL(path, 'https://finance.example');
test('tab and review-filter changes reuse the loaded month, including implicit current month', () => {
  assert.ok(isLocalMonthlyNavigation(url('/dashboard'), url('/dashboard?month=2026-10&view=analysis'), '2026-10'));
  assert.ok(isLocalMonthlyNavigation(url('/dashboard?month=2026-09&view=analysis'), url('/dashboard?month=2026-09&view=transactions&filter=pending')));
  assert.ok(isLocalMonthlyNavigation(url('/demo?view=transactions'), url('/demo?view=overview')));
  assert.ok(isLocalMonthlyNavigation(url('/dashboard?month=2026-10'), url('/dashboard?month=2026-10&period=1')));
});
test('month, route, origin and data parameter changes still load server data', () => {
  assert.equal(isLocalMonthlyNavigation(url('/dashboard?month=2026-09'),url('/dashboard?month=2026-10')),false);
  assert.equal(isLocalMonthlyNavigation(url('/dashboard?month=2026-09'),url('/dashboard')),false);
  assert.equal(isLocalMonthlyNavigation(url('/dashboard'),url('/dashboard/plans')),false);
  assert.equal(isLocalMonthlyNavigation(url('/dashboard'),new URL('https://other.example/dashboard')),false);
  assert.equal(isLocalMonthlyNavigation(url('/dashboard'),url('/dashboard?account=other')),false);
});

test('month changes preserve the active view and filter, clear overlays, and share canonical prefetch URLs', () => {
  const arrow = monthHref('/dashboard', 'view=transactions&filter=pending', '2026-09');
  const picker = monthHref('/dashboard', 'period=1&month=2026-10&filter=pending&view=transactions&entry=1', '2026-09');
  assert.equal(picker, arrow);
  assert.equal(picker, '/dashboard?filter=pending&month=2026-09&view=transactions');
  assert.equal(monthHref('/demo', '', '2026-01'), '/demo?month=2026-01&view=overview');
});
test('month navigation crosses years and rejects incomplete or out-of-range picker years', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  for (const value of ['0-01', '202-01', '2026.5-01', '1899-12', '2101-01', '2026-13']) {
    assert.equal(isNavigableMonth(value), false);
    assert.throws(() => monthHref('/dashboard', '', value), /Invalid month/);
  }
  assert.ok(isNavigableMonth('1900-01'));
  assert.ok(isNavigableMonth('2100-12'));
});
