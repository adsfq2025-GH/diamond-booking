import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getBookingsData, getDashboardContext } from "@/lib/dashboard/data";
import { BookingsClient } from "@/components/dashboard/sections/BookingsClient";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage() {
  const [data, context] = await Promise.all([getBookingsData(), getDashboardContext()]);
  return (
    <BookingsClient
      data={data}
      timezone={context.timezone}
      preview={!supabaseEnvConfigured()}
    />
  );
}
