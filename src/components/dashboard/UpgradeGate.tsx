import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";
import { Panel } from "./ui";

/**
 * Shown in place of a plan-gated section when the tenant's plan lacks the
 * feature. Points to the billing/plan settings to upgrade.
 */
export function UpgradeGate({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <Panel className="px-6 py-16">
      <div className="mx-auto flex max-w-[42ch] flex-col items-center text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-gold-100 text-gold-700">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-gold-300 bg-gold-50 px-2.5 py-[3px] text-[0.66rem] font-bold tracking-[0.08em] text-gold-700 uppercase">
          <Icon name="sparkle" className="h-3 w-3" />
          Upgrade
        </span>
        <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[0.88rem] leading-[1.7] text-ink-muted">{body}</p>
        <Link
          href="/dashboard/settings#billing"
          className={cn(
            "group mt-6 inline-flex items-center gap-2 rounded-[10px] border border-transparent px-5 py-2.5 text-[0.85rem] font-semibold",
            "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
            "transition-[transform,box-shadow] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)]",
          )}
        >
          View plans
          <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Panel>
  );
}
