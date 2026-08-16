import type { Metadata } from "next";
import { money, moneyCompact, percent } from "@/lib/format";
import { getReportsData } from "@/lib/dashboard/data";
import { BarChart, DonutRatio, RevenueBarChart } from "@/components/dashboard/charts";
import { Panel, PanelHeader, StatCard, Meter } from "@/components/dashboard/ui";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const r = await getReportsData();
  const maxPop = Math.max(1, ...r.servicePopularity.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue (completed)" value={money(r.totals.revenueCents)} caption="all bookings" />
        <StatCard label="Total bookings" value={String(r.totals.bookings)} caption="all statuses" />
        <StatCard label="Average ticket" value={money(r.totals.avgTicketCents)} caption="per completed job" />
        <StatCard
          label="No-show rate"
          value={percent(r.totals.noShowRate, 1)}
          caption="of all bookings"
          delta={r.totals.noShowRate}
          invertDelta
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Revenue trend" caption="Last 8 months" />
          <div className="px-5 py-5">
            <RevenueBarChart bars={r.revenueBars} height={188} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Bookings volume" caption="Last 8 months" />
          <div className="px-5 py-5">
            <BarChart
              height={188}
              bars={r.bookingsBars.map((b) => ({
                label: b.label,
                value: b.cents,
                display: String(b.cents),
                color: "var(--navy-400)",
              }))}
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Service popularity" caption="Completed bookings by service" />
          <ul className="space-y-4 px-5 py-5">
            {r.servicePopularity.map((s) => (
              <li key={s.name}>
                <div className="mb-1.5 flex items-center justify-between text-[0.83rem]">
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className="text-ink-faint">
                    {s.count} jobs · <span className="font-instrument font-semibold text-ink-muted">{moneyCompact(s.revenueCents)}</span>
                  </span>
                </div>
                <Meter value={s.count / maxPop} color="var(--blue-500)" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Customer retention" />
          <div className="flex flex-col items-center px-5 py-6">
            <DonutRatio value={r.retention.repeatRate} size={128} stroke={13} label="repeat" />
            <div className="mt-5 w-full space-y-2 border-t border-line pt-4 text-[0.83rem]">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Returning customers</span>
                <span className="font-instrument font-semibold text-ink">{r.retention.returning}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">New customers</span>
                <span className="font-instrument font-semibold text-ink">{r.retention.newCustomers}</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Team performance" caption="This month" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr>
                <th className="border-b border-line px-5 py-3 text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Team member</th>
                <th className="border-b border-line px-5 py-3 text-right text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Jobs</th>
                <th className="border-b border-line px-5 py-3 text-right text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Revenue</th>
                <th className="border-b border-line px-5 py-3 text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {r.employeePerformance.map((e) => (
                <tr key={e.name}>
                  <td className="border-b border-line px-5 py-3">
                    <span className="inline-flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: e.color }} />
                      <span className="font-medium text-ink">{e.name}</span>
                    </span>
                  </td>
                  <td className="border-b border-line px-5 py-3 text-right font-instrument font-semibold text-ink">{e.jobs}</td>
                  <td className="border-b border-line px-5 py-3 text-right font-instrument font-semibold text-ink">{moneyCompact(e.revenueCents)}</td>
                  <td className="border-b border-line px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Meter value={e.utilization} color={e.color} className="max-w-[140px]" />
                      <span className="font-instrument text-[0.8rem] font-semibold text-ink-muted">{Math.round(e.utilization * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
