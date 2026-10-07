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
