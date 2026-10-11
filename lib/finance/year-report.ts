import type { LedgerEntry } from "./core";

export const isReportYear = (value?: string): value is string => !!value && /^(19\d{2}|20\d{2}|2100)$/.test(value);

// Bound the selected-year read and reject truncated/error results rather than
// displaying partial annual totals. Count only the first page.
export async function loadYearReport(fetchPage: (offset: number) => Promise<{ rows: LedgerEntry[]; count: number | null; error: boolean }>) {
  const pageSize = 1000;
  const first = await fetchPage(0);
  if (first.error || first.count == null) throw new Error("The yearly report could not load.");
  if (first.count > 12000) throw new Error("This year exceeds the supported report size. Partial totals are not shown.");
  const rows = [...first.rows];
  if (first.rows.length !== Math.min(pageSize, first.count)) throw new Error("The yearly report is incomplete. Please retry.");
  for (let offset = pageSize; offset < first.count; offset += pageSize) {
    const page = await fetchPage(offset);
    if (page.error || page.rows.length !== Math.min(pageSize, first.count - offset)) throw new Error("The yearly report is incomplete. Please retry.");
    rows.push(...page.rows);
  }
  return rows;
}
