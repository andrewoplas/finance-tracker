import { dateOnly, minor } from "./core";

export type ImportRow = {
  row: number;
  date: string;
  amount: string;
  description: string;
  account: string;
  type: string;
  fingerprint: string;
  status: "ready" | "duplicate" | "exception";
  reason?: string;
};
// RFC4180 quoted fields, escaped quotes, embedded newlines, UTF-8 BOM and CRLF.
export function readCSV(source: string): string[][] {
  if (source.length > 2_000_000) throw new Error("CSV exceeds 2 MB");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function fingerprint(row: {
  date: string;
  amount: string;
  description: string;
  account: string;
  type: string;
}) {
  return JSON.stringify([
    row.date,
    minor(row.amount),
    row.description.trim().toLowerCase(),
    row.account.trim().toLowerCase(),
    row.type,
  ]);
}
export function stageBudgetFlow(
  csv: string,
  existing: Set<string> = new Set(),
): ImportRow[] {
  const [header, ...rows] = readCSV(csv);
  if (!header) throw new Error("CSV is empty");
  const columns = header.map((h) => h.trim().toLowerCase());
  const required = ["date", "amount", "description", "account", "type"];
  if (
    required.some((h) => !columns.includes(h)) ||
    new Set(columns).size !== columns.length
  )
    throw new Error(
      "Map CSV columns to date, amount, description, account, type before importing",
    );
  if (rows.length > 1000) throw new Error("Stage at most 1,000 rows per file");
  const seen = new Set(existing);
  return rows.map((values, index) => {
    const get = (key: string) => values[columns.indexOf(key)]?.trim() ?? "";
    const row = {
      row: index + 2,
      date: get("date"),
      amount: get("amount"),
      description: get("description"),
      account: get("account"),
      type: get("type").toLowerCase(),
      fingerprint: "",
    };
    try {
      dateOnly.parse(row.date);
      if (
        values.length !== columns.length ||
        minor(row.amount) <= 0 ||
        !row.description ||
        !row.account ||
        !["income", "expense", "transfer"].includes(row.type)
      )
        throw new Error("Invalid values");
      row.fingerprint = fingerprint(row);
      if (seen.has(row.fingerprint))
        return {
          ...row,
          status: "duplicate",
          reason:
            "Matches an existing or earlier staged row; compare both sources before resolving",
        };
      seen.add(row.fingerprint);
      if (row.type === "transfer")
        return {
          ...row,
          status: "exception",
          reason: "Map both transfer accounts; never import as spending",
        };
      return { ...row, status: "ready" };
    } catch {
      return {
        ...row,
        status: "exception",
        reason:
          "Check date (YYYY-MM-DD), positive decimal amount and required fields",
      };
    }
  });
}
