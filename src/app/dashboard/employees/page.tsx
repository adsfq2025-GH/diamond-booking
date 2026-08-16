import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getTeam } from "@/lib/dashboard/data";
import { TeamClient } from "@/components/dashboard/sections/TeamClient";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const team = await getTeam();
  return <TeamClient initial={team} preview={!supabaseEnvConfigured()} />;
}
