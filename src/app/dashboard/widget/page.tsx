import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getWidgetData } from "@/lib/dashboard/data";
import { WidgetClient } from "@/components/dashboard/sections/WidgetClient";

export const metadata: Metadata = { title: "Widget" };

export default async function WidgetPage() {
  const data = await getWidgetData();
  return <WidgetClient data={data} preview={!supabaseEnvConfigured()} />;
}
