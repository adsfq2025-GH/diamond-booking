import type { Metadata } from "next";
import { getCustomers } from "@/lib/dashboard/data";
import { CustomersClient } from "@/components/dashboard/sections/CustomersClient";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const customers = await getCustomers();
  return <CustomersClient initial={customers} />;
}
