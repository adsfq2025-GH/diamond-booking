import type { Metadata } from "next";
import { getTeam } from "@/lib/dashboard/data";
import { pendingInvitations } from "@/lib/actions/team";
import { getOnboardingReadiness } from "@/lib/actions/onboarding";
import { TeamClient } from "@/components/dashboard/sections/TeamClient";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const [team, pending, readiness] = await Promise.all([
    getTeam(),
    pendingInvitations(),
    getOnboardingReadiness(),
  ]);
  return (
    <TeamClient
      initial={team}
      pending={pending}
      readiness={
        readiness.ok
          ? { bookingReady: readiness.bookingReady, blockers: readiness.blockers }
          : null
      }
    />
  );
}
