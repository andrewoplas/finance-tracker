import { Suspense } from "react";
import { PlanningTabs } from "@/components/layout/planning-tabs";
import { FinancePlans } from "@/components/dashboard/finance-plans";
import { PlannedItemsSection } from "@/components/recurring/planned-items";
export default function Page() {
  return <><div className="overview"><Suspense><PlanningTabs demo /></Suspense></div><FinancePlans demo><PlannedItemsSection /></FinancePlans></>;
}
