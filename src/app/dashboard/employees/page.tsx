import type { Metadata } from "next";
import { getTeam } from "@/lib/dashboard/data";
import { pendingInvitations } from "@/lib/actions/team";
import { TeamClient } from "@/components/dashboard/sections/TeamClient";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const [team, pending] = await Promise.all([getTeam(), pendingInvitations()]);
  return <TeamClient initial={team} pending={pending} />;
}
