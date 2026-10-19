import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { embedAllowedForKey, getWidgetConfig, getWidgetRecurringEnabled } from "@/lib/widget/data";
import { emailWillSendForKey } from "@/lib/integrations/email";
import { BookingFlow } from "@/components/widget/BookingFlow";

export const metadata: Metadata = {
  title: "Book an appointment",
  robots: { index: false },
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_key: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { public_key } = await params;
  const { embed } = await searchParams;
  const embedded = embed === "1";

  const config = await getWidgetConfig(public_key);
  if (!config) notFound();

  // Enforce the tenant's allowed-domains list for EMBEDDED loads (A26). It was
  // collected and displayed but never checked by anything.
  if (embedded) {
    const referer = (await headers()).get("referer");
    const embedCheck = await embedAllowedForKey(public_key, referer);
    if (!embedCheck.allowed) {
      return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-surface-alt px-4 py-10">
          <div className="max-w-[420px] rounded-[14px] border border-line bg-card px-6 py-8 text-center">
            <p className="font-display text-[1.05rem] font-semibold text-ink">
              This booking widget isn&rsquo;t allowed on this website
            </p>
            <p className="mt-2 text-[0.85rem] leading-[1.6] text-ink-muted">
              The business has restricted it to{" "}
              {embedCheck.domains.join(", ")}. If this is your site, add this
              domain in Dashboard → Widget → Allowed domains.
            </p>
          </div>
        </main>
      );
    }
  }
  const [emailWillSend, recurringEnabled] = await Promise.all([
    emailWillSendForKey(public_key),
    getWidgetRecurringEnabled(public_key),
  ]);

  return (
    <main
      className={
        embedded
          ? "w-full bg-transparent p-2"
          : "flex min-h-dvh w-full items-center justify-center bg-surface-alt px-4 py-10"
      }
    >
      <BookingFlow
        publicKey={public_key}
        config={config}
        embedded={embedded}
        emailWillSend={emailWillSend}
        recurringEnabled={recurringEnabled}
      />
    </main>
  );
}
