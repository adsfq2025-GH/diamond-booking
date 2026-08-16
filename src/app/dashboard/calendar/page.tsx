import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getCalendarData, getDashboardContext } from "@/lib/dashboard/data";
import { CalendarClient } from "@/components/dashboard/sections/CalendarClient";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [data, context] = await Promise.all([getCalendarData(), getDashboardContext()]);
  return (
    <CalendarClient data={data} timezone={context.timezone} preview={!supabaseEnvConfigured()} />
  );
}
