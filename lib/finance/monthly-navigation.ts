/** Only presentation changes may reuse the currently loaded month's data. */
export function isLocalMonthlyNavigation(current: URL, next: URL, loadedMonth?: string) {
  if (current.origin !== next.origin || current.pathname !== next.pathname || !['/dashboard', '/demo'].includes(current.pathname)) return false;
  if ((current.searchParams.get('month') ?? loadedMonth) !== (next.searchParams.get('month') ?? loadedMonth)) return false;
  const dataParams = (url: URL) => {
    const params = new URLSearchParams(url.search);
    for (const key of ['view', 'filter', 'period', 'month']) params.delete(key);
    params.sort();
    return params.toString();
  };
  return dataParams(current) === dataParams(next);
}

/** Canonical URLs let arrow and picker navigation share the same prefetched month. */
export function monthHref(path: string, search: string, month: string) {
  if (!isNavigableMonth(month)) throw new Error('Invalid month');
  const params = new URLSearchParams(search);
  params.set('month', month);
  params.set('view', params.get('view') || 'overview');
  params.delete('period');
  params.delete('entry');
  params.sort();
  return `${path}?${params}`;
}

export function isNavigableMonth(month: string) {
  return /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month);
}

export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
