import type { Metadata } from "next";
import { getDashboardContext, getInvoicesData } from "@/lib/dashboard/data";
import { hasFeature } from "@/lib/plans";
import { InvoicesClient } from "@/components/dashboard/sections/InvoicesClient";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const [context, data] = await Promise.all([getDashboardContext(), getInvoicesData()]);
  if (!hasFeature(context.plan, "invoicing")) {
    return (
      <UpgradeGate
        icon="invoices"
        title="Invoicing is a Professional feature"
        body="Generate branded invoices, take deposits and track payments by upgrading your plan."
      />
    );
  }
  return <InvoicesClient data={data} />;
}
