import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getBookingsData } from "@/lib/dashboard/data";
import { BookingsClient } from "@/components/dashboard/sections/BookingsClient";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage() {
  const data = await getBookingsData();
  return <BookingsClient data={data} preview={!supabaseEnvConfigured()} />;
}
