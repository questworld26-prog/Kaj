// [spec: UI-009]
// [spec: UI-012]
// [spec: UI-013]
import { h } from "preact";
import { useMemo } from "preact/hooks";
import {
  getISOYearWeekKey,
  type Project,
  type Task,
  type TelemetrySummary,
} from "../../../shared/types.js";
import {
  buildCreatorStackDataFromSummary,
  buildTelemetrySummaryFromTasks,
  getISOWeekKey,
} from "./types.js";

interface CockpitTelemetryDeckProps {
  completedTasks: Task[];
  projects: Project[];
  telemetry?: TelemetrySummary | null;
}

export function CockpitTelemetryDeck({
  completedTasks,
  projects,
  telemetry = null,
}: CockpitTelemetryDeckProps) {
  const effectiveTelemetry = useMemo(
    () => telemetry ?? buildTelemetrySummaryFromTasks(completedTasks),
    [telemetry, completedTasks],
  );

  // Telemetry 1: Tasks Completed by Week (last 6 ISO weeks)
  const weeklyVelocity = useMemo(() => {
    const now = new Date();
    const weeks: Array<{
      yearWeek: string;
      label: string;
      count: number;
      isCurrent: boolean;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      weeks.push({
        yearWeek: getISOYearWeekKey(d),
        label: getISOWeekKey(d),
        count: 0,
        isCurrent: i === 0,
      });
    }

    const weekCountMap = new Map(
      effectiveTelemetry.by_week.map((w) => [w.iso_week, w.count]),
    );
    for (const w of weeks) {
      w.count = weekCountMap.get(w.yearWeek) || 0;
    }
    return weeks;
  }, [effectiveTelemetry]);

  const maxWeeklyCount = useMemo(() => {
    const counts = weeklyVelocity.map((w) => w.count);
    return Math.max(...counts, 1);
  }, [weeklyVelocity]);

  // Telemetry 2: Completed Tasks by Project (Pie / Donut)
  const projectDistribution = useMemo(() => {
    const countsByProj: Record<
      string,
      { name: string; color: string; count: number }
    > = {};

    // Seed all known projects
    for (const p of projects) {
      countsByProj[p.id] = {
        name: p.name,
        color: p.color || "#10B981",
        count: 0,
      };
    }
    countsByProj["unassigned"] = {
      name: "Inbox / Unassigned",
      color: "#A855F7",
      count: 0,
    };

    for (const entry of effectiveTelemetry.by_project) {
      const pid = entry.project_key || "unassigned";
      if (countsByProj[pid]) {
        countsByProj[pid].count += entry.count;
      } else {
        countsByProj[pid] = {
          name: "Other Project",
          color: "#64748B",
          count: entry.count,
        };
      }
    }

    const items = Object.values(countsByProj).filter((item) => item.count > 0);
    if (items.length === 0) {
      return { total: 0, segments: [] };
    }

    const total = items.reduce((acc, curr) => acc + curr.count, 0);
    let cumulativePercent = 0;

    const segments = items.map((item) => {
      const percentage = (item.count / total) * 100;
      const strokeDasharray = `${percentage} ${100 - percentage}`;
      const strokeDashoffset = -cumulativePercent;
      cumulativePercent += percentage;
      return {
        ...item,
        percentage: Math.round(percentage),
        strokeDasharray,
        strokeDashoffset,
      };
    });

    return { total, segments };
  }, [effectiveTelemetry, projects]);

  // Telemetry 1: Stacked Completed by Creator (latest week on top, counts rendered inside bar)
  const creatorStackData = useMemo(
    () => buildCreatorStackDataFromSummary(effectiveTelemetry),
    [effectiveTelemetry],
  );

  return (
    <div className="col-span-12 lg:col-span-5 space-y-5">
      {/* Chart 1: Horizontal Stacked Completed by Creator */}
      <section
        data-testid="cockpit-creator-stacked-chart"
        className="rounded-2xl bg-[#121718] border border-[#2A3235] p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              👥 Stacked Completed Tasks by Creator
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Horizontal weekly breakdown segmented by `created_by`
            </p>
          </div>
          <span className="text-xs text-gray-400">Latest Week First</span>
        </div>

        {creatorStackData.creatorList.length === 0 ? (
          <div className="text-xs text-gray-400 italic py-6 text-center">
            No creator attribution recorded on completed tasks yet.
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            {creatorStackData.weeks.map((w) => (
              <div key={w.label} data-testid="creator-stacked-week-row">
                <div className="flex justify-between text-xs mb-1">
                  <span
                    className={
                      w.isCurrent
                        ? "text-emerald-400 font-semibold"
                        : "text-gray-300 font-medium"
                    }
                  >
                    {w.label}
                  </span>
                  <span className="text-gray-400">
                    {w.total} {w.total === 1 ? "task" : "tasks"}
                  </span>
                </div>
                {w.total === 0 ? (
                  <div className="w-full h-6 rounded-lg bg-[#1C2224] border border-[#2A3235] text-xs text-gray-400 flex items-center px-2.5">
                    0 completed
                  </div>
                ) : (
                  <div className="w-full h-6 rounded-lg overflow-hidden flex bg-[#1C2224]">
                    {creatorStackData.creatorList.map((creator) => {
                      const count = w.creators[creator] || 0;
                      if (count === 0) return null;
                      const pct = (count / w.total) * 100;
                      const segmentStyle =
                        creatorStackData.creatorStyleMap[creator];
                      return (
                        <div
                          key={creator}
                          data-testid="creator-bar-segment"
                          data-creator={creator}
                          style={{
                            width: `${pct}%`,
                            minWidth: "1.35rem",
                            backgroundColor: segmentStyle.bg,
                            color: segmentStyle.text,
                          }}
                          className="h-full flex items-center justify-center text-xs font-bold leading-none tabular-nums px-1 overflow-hidden hover:brightness-110 transition-all"
                          title={`${creator}: ${count} (${Math.round(pct)}%)`}
                        >
                          {count}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Creator Color Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs border-t border-[#2A3235] pt-3">
              {creatorStackData.creatorList.map((creator) => (
                <span
                  key={creator}
                  className="flex items-center gap-1.5 text-gray-300"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        creatorStackData.creatorStyleMap[creator].bg,
                    }}
                  />
                  <span>{creator}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Chart 2: Tasks Completed by Week (Velocity Bar Chart) */}
      <section
        data-testid="cockpit-weekly-velocity-chart"
        className="rounded-2xl bg-[#121718] border border-[#2A3235] p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              📈 Tasks Completed by Week
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Recent 6 weeks completion velocity (Total: {effectiveTelemetry.total_completed}{" "}
              done)
            </p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
            {weeklyVelocity[weeklyVelocity.length - 1]?.count || 0} this week
          </span>
        </div>

        <div className="grid grid-cols-6 gap-2 items-end h-32 pt-2 px-1 border-b border-[#2A3235]">
          {weeklyVelocity.map((w) => {
            const heightPct = Math.max(
              Math.round((w.count / maxWeeklyCount) * 100),
              8,
            );
            return (
              <div
                key={w.label}
                className="flex flex-col items-center gap-1.5 h-full justify-end"
              >
                <span className="text-xs font-semibold text-gray-300">
                  {w.count}
                </span>
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t-md transition-all ${
                    w.isCurrent
                      ? "bg-[#10B981] shadow-md shadow-emerald-950"
                      : "bg-[#1C2224] border border-emerald-500/40 hover:bg-emerald-500/20"
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-6 gap-2 text-center text-xs text-gray-400 pt-2">
          {weeklyVelocity.map((w) => (
            <span
              key={w.label}
              className={w.isCurrent ? "text-emerald-400 font-bold" : ""}
            >
              {w.label}
            </span>
          ))}
        </div>
      </section>

      {/* Chart 2: Completed Tasks by Project (Pie / Donut Chart) */}
      <section
        data-testid="cockpit-project-distribution-chart"
        className="rounded-2xl bg-[#121718] border border-[#2A3235] p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              🍩 Completed Tasks by Project
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Distribution across active project swimlanes
              {effectiveTelemetry.snapshotted_completed > 0
                ? ` · Includes ${effectiveTelemetry.snapshotted_completed} archived snapshot(s)`
                : ""}
            </p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-[#1C2224] text-gray-300 border border-[#2A3235]">
            {projectDistribution.total} Total Done
          </span>
        </div>

        {projectDistribution.segments.length === 0 ? (
          <div className="text-xs text-gray-400 italic py-6 text-center">
            No completed tasks recorded yet.
          </div>
        ) : (
          <div className="flex items-center gap-6 pt-2">
            {/* SVG Donut */}
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="transparent"
                  stroke="#1C2224"
                  strokeWidth="5"
                />
                {projectDistribution.segments.map((seg) => (
                  <circle
                    key={seg.name}
                    cx="18"
                    cy="18"
                    r="14"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="5"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-white leading-none">
                  {projectDistribution.total}
                </span>
                <span className="text-xs text-gray-400 mt-0.5">Done</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2 text-xs">
              {projectDistribution.segments.map((seg) => (
                <div
                  key={seg.name}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2 text-gray-200 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="truncate">{seg.name}</span>
                  </span>
                  <span className="font-semibold text-white shrink-0 ml-2">
                    {seg.count}{" "}
                    <span className="text-gray-400 font-normal">
                      ({seg.percentage}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
