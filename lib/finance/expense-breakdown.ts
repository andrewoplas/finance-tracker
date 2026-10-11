import type { LedgerEntry } from "./core";

// Imported Budget Flow categories are broad; these saved tags carry the detail.
// Count each purchase exactly once. Conflicting or unrelated tags stay in the saved category.
const detailedLabels = new Map(Object.entries({
  food: "Food & dining", dining: "Food & dining", "food & dining": "Food & dining",
  transportation: "Transport", transport: "Transport", utilities: "Bills & utilities", bills: "Bills & utilities",
  fitness: "Fitness", sports: "Sports", subscription: "Subscriptions", subscriptions: "Subscriptions",
  gift: "Gifts", gifts: "Gifts", groceries: "Groceries", shopping: "Shopping",
  health: "Health", healthcare: "Health", entertainment: "Entertainment", education: "Education", travel: "Travel",
}));
export function expenseBreakdown(entries: LedgerEntry[], categories: { id: string; name: string }[], tags: { id: string; name: string }[]) {
  const names = new Map(categories.map(category => [category.id, category.name]));
  const tagNames = new Map(tags.map(tag => [tag.id, detailedLabels.get(tag.name.trim().toLowerCase())]));
  const ids = new Map<LedgerEntry, string | null>();
  for (const entry of entries) {
    let id = entry.category_id;
    if (entry.type === "expense" && (!id || /^(spending|fixed expenses)$/i.test(names.get(id) ?? ""))) {
      const labels = new Set((entry.tag_ids ?? []).map(tag => tagNames.get(tag)).filter((name): name is string => !!name));
      if (labels.size === 1) {
        const label = [...labels][0];
        id = `detail:${label}`;
        names.set(id, label);
      }
    }
    ids.set(entry, id);
  }
  return { names, idFor: (entry: LedgerEntry) => ids.get(entry) ?? entry.category_id };
}
