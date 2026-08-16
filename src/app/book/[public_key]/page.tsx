import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWidgetConfig } from "@/lib/widget/data";
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
  const emailWillSend = await emailWillSendForKey(public_key);

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
      />
    </main>
  );
}
