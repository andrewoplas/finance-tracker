import { test } from "node:test";
import assert from "node:assert/strict";
import { commitOperation } from "../lib/finance/client";
import type { Operation } from "../lib/finance/contracts";
test("browser retry keeps the idempotency key and stores no raw financial payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const storage = new Map<string, string>();
  const ids: string[] = [];
  let fail = true;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
  globalThis.fetch = async (input, init) => {
    const payload = JSON.parse(String(init?.body));
    if (String(input).endsWith("preview"))
      return Response.json({ digest: "test-digest" });
    ids.push(payload.request_id);
    if (fail) {
      fail = false;
      throw new Error("Ambiguous network failure");
    }
    return Response.json({ result: { saved: true } });
  };
  const operation: Operation = {
    action: "reconcile_balance",
    id: "10000000-0000-4000-8000-000000000001",
    expected_revision: 1,
    target_type: "account",
    as_of_date: "2026-10-06",
    observed_balance: "1000",
    reason: "Synthetic statement",
  };
  try {
    assert.ok((await commitOperation(operation)).error);
    assert.equal(storage.size, 1);
    assert.ok([...storage.keys()][0].match(/^finance-request:[a-f0-9]{64}$/));
    assert.ok(![...storage.values()].join().includes("Synthetic"));
    assert.equal((await commitOperation(operation)).error, null);
    assert.equal(ids[0], ids[1]);
    assert.equal(storage.size, 0);
    assert.equal((await commitOperation(operation)).error, null);
    assert.notEqual(ids[1], ids[2]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage)
      Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
