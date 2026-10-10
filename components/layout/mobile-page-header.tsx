"use client";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeading } from "./page-heading";
import type { ReactNode } from "react";

export function MobilePageHeader({ title, subtitle, showBack = false, action }: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  return <div className="page-heading-with-back">
    {showBack && <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => router.back()}><ArrowLeft /></Button>}
    <PageHeading title={title} description={subtitle} action={action} />
  </div>;
}
