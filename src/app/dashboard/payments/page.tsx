import type { Metadata } from "next";
import { getPaymentsData } from "@/lib/dashboard/data";
import { PaymentsClient } from "@/components/dashboard/sections/PaymentsClient";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const data = await getPaymentsData();
  return <PaymentsClient data={data} />;
}
