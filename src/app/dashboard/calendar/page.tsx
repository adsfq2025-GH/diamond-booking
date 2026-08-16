import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getCalendarData } from "@/lib/dashboard/data";
import { CalendarClient } from "@/components/dashboard/sections/CalendarClient";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const data = await getCalendarData();
  return <CalendarClient data={data} preview={!supabaseEnvConfigured()} />;
}
