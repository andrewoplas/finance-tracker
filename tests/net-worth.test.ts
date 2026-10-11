import test from "node:test";
import assert from "node:assert/strict";
import { netWorth } from "../lib/finance/net-worth";

const account = (balance: string | null, opening_balance: string | null = "0", is_archived = false) => ({ balance, opening_balance, is_archived });
test("net worth uses signed active account balances and exact centavos", () => {
  assert.deepEqual(netWorth([account("2000.10"), account("-500.03"), account("0.01"), account("9000", "0", true)]), {
    status: "ready", assets: 200011, debts: 50003, total: 150008, accountCount: 3, unknownCount: 0,
  });
  assert.equal(netWorth([account("-200")]).total, -20000);
  assert.equal(netWorth([account("0")]).status, "ready");
});
test("unknown or invalid balances do not produce a misleading partial net worth", () => {
  for (const missing of [account("50", null), account(null), account("NaN")]) {
    const result = netWorth([account("1000"), missing]);
    assert.equal(result.status, "unknown");
    assert.equal(result.unknownCount, 1);
    assert.equal(result.total, 0);
    assert.equal(result.assets, 0);
  }
  assert.equal(netWorth([account("1000"), account(null, null, true)]).status, "ready");
  assert.equal(netWorth([]).status, "empty");
  assert.equal(netWorth([account("1000", "0", true)]).status, "empty");
});
