import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalMonthlyNavigation } from '../lib/finance/monthly-navigation';
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
