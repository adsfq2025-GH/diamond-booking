import { Icon, type IconName } from "./icons";
import { Panel } from "./ui";

/**
 * Interim placeholder for dashboard sections still being built out this phase.
 * Keeps navigation coherent (no 404s) while the shell is under review.
 */
export function ComingSoon({
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
      <div className="mx-auto flex max-w-[40ch] flex-col items-center text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-[16px] bg-blue-50 text-blue-600">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <h2 className="font-display text-[1.2rem] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[0.86rem] leading-[1.7] text-ink-muted">{body}</p>
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-surface-alt px-3 py-1 text-[0.72rem] font-semibold text-ink-faint">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Building this section
        </p>
      </div>
    </Panel>
  );
}
