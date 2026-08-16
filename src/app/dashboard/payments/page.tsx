import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getPaymentsData } from "@/lib/dashboard/data";
import { PaymentsClient } from "@/components/dashboard/sections/PaymentsClient";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const data = await getPaymentsData();
  return <PaymentsClient data={data} preview={!supabaseEnvConfigured()} />;
}
