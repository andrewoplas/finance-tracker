"use client";

import { useRef, useState, useTransition, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { isNavigableMonth, monthHref, shiftMonth } from "@/lib/finance/monthly-navigation";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerTrigger, DrawerClose,
} from "@/components/ui/drawer";

const monthLabel = (month: string) => new Intl.DateTimeFormat("en", {
  month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${month}-01T00:00:00Z`));

function MonthLink({ eager = false, ...props }: ComponentProps<typeof Link> & { eager?: boolean }) {
  const [intent, setIntent] = useState(false);
  // Fully prefetch only the two adjacent months, or another month the user targets.
  // Default dynamic-route prefetching stops at the loading boundary.
  return <Link {...props} prefetch={eager || intent} scroll={false}
    onMouseEnter={() => setIntent(true)} onFocus={() => setIntent(true)}
    onTouchStart={() => setIntent(true)} />;
}

export function PeriodPicker({ month }: { month: string }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [closing, setClosing] = useState(false);
  const [targetMonth, setTargetMonth] = useState(month);
  const [pending, startTransition] = useTransition();
  const launched = useRef(false);
  const router = useRouter(), path = usePathname(), search = useSearchParams();
  const open = search.get("period") === "1" && !closing;
  const label = monthLabel(month);
  const previous = shiftMonth(month, -1), next = shiftMonth(month, 1);
  const href = (value: string) => monthHref(path, search.toString(), value);

  function setOpen(value: boolean) {
    if (pending) return;
    const params = new URLSearchParams(search.toString());
    setClosing(!value);
    if (value) {
      setYear(Number(month.slice(0, 4)));
      launched.current = true;
      params.set("period", "1");
      window.history.pushState(null, "", `${path}?${params}`);
    } else if (launched.current) {
      launched.current = false;
      router.back();
    } else {
      params.delete("period");
      window.history.replaceState(null, "", `${path}?${params}`);
    }
  }

  function navigate(value: string, replace: boolean) {
    if (pending) return;
    // Close the drawer outside the transition: a slow response must not trap it open.
    setClosing(true);
    launched.current = false;
    if (value === month) {
      const params = new URLSearchParams(search.toString());
      params.delete("period");
      window.history.replaceState(null, "", `${path}?${params}`);
      return;
    }
    setTargetMonth(value);
    startTransition(() => {
      if (replace) router.replace(href(value), { scroll: false });
      else router.push(href(value), { scroll: false });
    });
  }

  return <div className="month-navigation">
    <div className="month-switch" aria-busy={pending}>
      {isNavigableMonth(previous) && <MonthLink eager href={href(previous)}
        aria-label="Previous month" aria-disabled={pending}
        onNavigate={event => { event.preventDefault(); navigate(previous, false); }}>
        <ChevronLeft size={18} />
      </MonthLink>}
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerTrigger asChild><button className="period-chip" disabled={pending}
          aria-label={`Choose period, ${label}`}>{label}</button></DrawerTrigger>
        <DrawerContent className="period-sheet">
          <DrawerHeader><div className="entry-sheet-heading">
            <DrawerTitle>Choose month</DrawerTitle>
            <DrawerClose aria-label="Close period picker"><X size={20} /></DrawerClose>
          </div><DrawerDescription>Updates the overview, transactions, and spending plan.</DrawerDescription></DrawerHeader>
          <div className="period-content">
            <label className="workflow-field">Year<input aria-label="Year" type="number"
              min="1900" max="2100" value={year} onChange={event => setYear(Number(event.target.value))} /></label>
            <div className="month-grid">{Array.from({ length: 12 }, (_, i) => {
              const value = `${year}-${String(i + 1).padStart(2, "0")}`;
              const short = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
                .format(new Date(Date.UTC(2026, i, 1)));
              if (!isNavigableMonth(value)) return <button disabled key={i}>{short}</button>;
              if (value === month) return <button key={i} aria-pressed onClick={() => navigate(value, true)}>
                {short}<Check size={16} />
              </button>;
              return <MonthLink key={i} href={href(value)} replace
                aria-label={monthLabel(value)} onNavigate={event => { event.preventDefault(); navigate(value, true); }}>
                {short}
              </MonthLink>;
            })}</div>
          </div>
        </DrawerContent>
      </Drawer>
      {isNavigableMonth(next) && <MonthLink eager href={href(next)}
        aria-label="Next month" aria-disabled={pending}
        onNavigate={event => { event.preventDefault(); navigate(next, false); }}>
        <ChevronRight size={18} />
      </MonthLink>}
    </div>
    <span className="month-loading" role="status">{pending ? `Loading ${monthLabel(targetMonth)}…` : ""}</span>
  </div>;
}
