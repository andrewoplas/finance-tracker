import { entrySchema, manilaToday } from "./core";
import { operationSchema, type Operation } from "./contracts";

// A network retry reuses the same key until a successful response. Do not silently
// retry with a new key after an ambiguous outcome.
const pending = new Map<string, string>();
export async function commitOperation(
  operation: Operation,
): Promise<{ error: Error | null; result?: unknown }> {
  try {
    const validated = operationSchema.safeParse(operation);
    if (!validated.success)
      return {
        error: new Error(
          validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        ),
      };
    operation = validated.data;
    const signature = JSON.stringify(operation);
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(signature),
    );
    const storageKey =
      "finance-request:" +
      Array.from(new Uint8Array(bytes), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(storageKey);
    } catch {
      /* memory retry fallback */
    }
    const request_id = pending.get(signature) ?? stored ?? crypto.randomUUID();
    pending.set(signature, request_id);
    try {
      sessionStorage.setItem(storageKey, request_id);
    } catch {
      /* memory retry fallback */
    }
    const payload = JSON.stringify({ request_id, operation });
    const preview = await fetch("/api/finance/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const p = await preview.json();
    if (!preview.ok) throw new Error(p.error ?? "Preview rejected");
    const response = await fetch("/api/finance/commit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-finance-preview": p.digest,
      },
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Commit rejected");
    pending.delete(signature);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* memory retry fallback */
    }
    return { error: null, result: data.result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error
          : new Error("Connection failed; retry uses the same request key"),
    };
  }
}
export async function createEntries(
  rows: Record<string, unknown> | Record<string, unknown>[],
) {
  try {
    const entries = (Array.isArray(rows) ? rows : [rows]).map((row) =>
      entrySchema.parse({
        account_id: row.account_id,
        category_id: row.category_id ?? null,
        wallet_id: row.wallet_id ?? null,
        type: row.type,
        amount: String(row.amount),
        description: row.description || "Transaction",
        date: row.date ?? manilaToday(),
        to_account_id: row.to_account_id ?? null,
        report_month: String(row.date ?? manilaToday()).slice(0, 7),
      }),
    );
    return await commitOperation({ action: "create", entries });
  } catch {
    return {
      error: new Error("Check transaction amounts, dates and accounts"),
    };
  }
}
