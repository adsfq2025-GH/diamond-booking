import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getCustomers } from "@/lib/dashboard/data";
import { CustomersClient } from "@/components/dashboard/sections/CustomersClient";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const customers = await getCustomers();
  return <CustomersClient initial={customers} preview={!supabaseEnvConfigured()} />;
}
