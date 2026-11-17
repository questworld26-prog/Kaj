// [spec: UI-009]
// [spec: UI-012]
// [spec: UI-013]
// [spec: UI-014]
import { h } from "preact";
import { useMemo, useState } from "preact/hooks";
import type {
  Project,
  Task,
  TelemetrySummary,
} from "../../../shared/types.js";
import {
  buildCreatorStackDataFromSummary,
  buildMonthlyVelocityStackFromSummary,
  buildTelemetrySummaryFromTasks,
  buildWeeklyVelocityStackFromSummary,
} from "./types.js";

type VelocityPeriod = "week" | "month";

const VELOCITY_PERIOD_STORAGE_KEY = "kaj_cockpit_velocity_period";

function loadInitialVelocityPeriod(): VelocityPeriod {
  try {
    const saved = window.localStorage.getItem(VELOCITY_PERIOD_STORAGE_KEY);
    return saved === "month" ? "month" : "week";
  } catch {
    return "week";
  }
}

interface CockpitTelemetryDeckProps {
  completedTasks: Task[];
  projects: Project[];
  telemetry?: TelemetrySummary | null;
  defaultCreator?: string | null;
}

export function CockpitTelemetryDeck({
  completedTasks,
  projects,
  telemetry = null,
  defaultCreator = null,
}: CockpitTelemetryDeckProps) {
  const [velocityPeriod, setVelocityPeriod] = useState<VelocityPeriod>(
    loadInitialVelocityPeriod,
  );

  const handleVelocityPeriodChange = (nextPeriod: VelocityPeriod) => {
    setVelocityPeriod(nextPeriod);
    try {
      window.localStorage.setItem(VELOCITY_PERIOD_STORAGE_KEY, nextPeriod);
    } catch {
      // Ignore storage access errors in restricted contexts
    }
  };

  const effectiveTelemetry = useMemo(
    () =>
      telemetry ??
      buildTelemetrySummaryFromTasks(completedTasks, undefined, defaultCreator),
    [telemetry, completedTasks, defaultCreator],
  );

  // Telemetry 2: Tasks Completed by Week / Month (last 6 ISO weeks or 6 calendar months stacked by creator)
  const weeklyVelocityStack = useMemo(
    () =>
      buildWeeklyVelocityStackFromSummary(
        effectiveTelemetry,
        undefined,
        defaultCreator,
      ),
    [effectiveTelemetry, defaultCreator],
  );

  const monthlyVelocityStack = useMemo(
    () =>
      buildMonthlyVelocityStackFromSummary(
        effectiveTelemetry,
        undefined,
        defaultCreator,
      ),
    [effectiveTelemetry, defaultCreator],
  );

  const activeVelocityStack =
    velocityPeriod === "month" ? monthlyVelocityStack : weeklyVelocityStack;

  const maxVelocityCount = useMemo(() => {
    const counts = activeVelocityStack.weeks.map((w) => w.total);
    return Math.max(...counts, 1);
  }, [activeVelocityStack]);

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
    () =>
      buildCreatorStackDataFromSummary(
        effectiveTelemetry,
        undefined,
        defaultCreator,
      ),
    [effectiveTelemetry, defaultCreator],
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
                      const roundedPct = Math.round(pct);
                      const segmentStyle =
                        weeklyVelocityStack.creatorStyleMap[creator] ||
                        creatorStackData.creatorStyleMap[creator];
                      return (
                        <div
                          key={creator}
                          data-testid="creator-bar-segment"
                          data-creator={creator}
                          style={{
                            width: `${pct}%`,
                            minWidth: "3.25rem",
                            backgroundColor: segmentStyle.bg,
                            color: segmentStyle.text,
                          }}
                          className="h-full flex items-center justify-center text-xs font-bold leading-none tabular-nums whitespace-nowrap px-1.5 overflow-hidden hover:brightness-110 transition-all"
                          title={`${creator}: ${count} (${roundedPct}%)`}
                        >
                          {count} ({roundedPct}%)
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
                      backgroundColor: (
                        weeklyVelocityStack.creatorStyleMap[creator] ||
                        creatorStackData.creatorStyleMap[creator]
                      ).bg,
                    }}
                  />
                  <span>{creator}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Chart 2: Tasks Completed by Week / Month (Stacked by Creator) */}
      <section
        data-testid="cockpit-weekly-velocity-chart"
        className="rounded-2xl bg-[#121718] border border-[#2A3235] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {velocityPeriod === "month"
                ? "📈 Tasks Completed by Month"
                : "📈 Tasks Completed by Week"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {velocityPeriod === "month"
                ? "Recent 6 months stacked by creator"
                : "Recent 6 weeks stacked by creator"}{" "}
              (Total: {effectiveTelemetry.total_completed} done)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Velocity chart period"
              className="inline-flex items-center rounded-lg bg-[#1C2224] border border-[#2A3235] p-0.5"
            >
              {(["week", "month"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  data-testid={`velocity-toggle-${period}`}
                  aria-pressed={velocityPeriod === period}
                  onClick={() => handleVelocityPeriodChange(period)}
                  className="min-h-[24px] min-w-[24px] px-2.5 py-0.5 rounded-md text-xs font-semibold border border-transparent transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-1 text-gray-300 hover:text-white aria-[pressed=true]:bg-emerald-500/20 aria-[pressed=true]:text-emerald-300 aria-[pressed=true]:border-emerald-500/50"
                >
                  {period === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
              {activeVelocityStack.weeks[activeVelocityStack.weeks.length - 1]
                ?.total || 0}{" "}
              {velocityPeriod === "month" ? "this month" : "this week"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 items-end h-32 pt-2 px-1 border-b border-[#2A3235]">
          {activeVelocityStack.weeks.map((w) => {
            const heightPct =
              w.total === 0
                ? 8
                : Math.max(Math.round((w.total / maxVelocityCount) * 100), 12);
            return (
              <div
                key={w.weekKey || w.label}
                data-testid="velocity-week-column"
                className="flex flex-col items-center gap-1.5 h-full justify-end"
              >
                <span className="text-xs font-semibold text-gray-300">
                  {w.total}
                </span>
                {w.total === 0 ? (
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-md ${w.isCurrent
                      ? "bg-[#1C2224] border border-emerald-500/40"
                      : "bg-[#1C2224] border border-[#2A3235]"
                      }`}
                  />
                ) : (
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-md overflow-hidden flex flex-col-reverse ${w.isCurrent
                      ? "ring-1 ring-emerald-400/70 shadow-md shadow-emerald-950"
                      : ""
                      }`}
                  >
                    {activeVelocityStack.creatorList.map((creator) => {
                      const count = w.creators[creator] || 0;
                      if (count === 0) return null;
                      const segPct = (count / w.total) * 100;
                      const segStyle =
                        activeVelocityStack.creatorStyleMap[creator];
                      return (
                        <div
                          key={creator}
                          data-testid="velocity-bar-segment"
                          data-creator={creator}
                          style={{
                            height: `${segPct}%`,
                            backgroundColor: segStyle.bg,
                            color: segStyle.text,
                          }}
                          className="w-full flex items-center justify-center text-[10px] font-bold leading-none tabular-nums overflow-hidden hover:brightness-110 transition-all"
                          title={`${creator}: ${count} (${Math.round(segPct)}%)`}
                        >
                          {segPct >= 25 && heightPct >= 28 ? count : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-6 gap-2 text-center text-xs text-gray-400 pt-2">
          {activeVelocityStack.weeks.map((w) => (
            <span
              key={w.weekKey || w.label}
              className={w.isCurrent ? "text-emerald-400 font-bold" : ""}
            >
              {w.label}
            </span>
          ))}
        </div>

        {activeVelocityStack.creatorList.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs border-t border-[#2A3235] pt-3 mt-3">
            {activeVelocityStack.creatorList.map((creator) => (
              <span
                key={creator}
                className="flex items-center gap-1.5 text-gray-300"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor:
                      activeVelocityStack.creatorStyleMap[creator].bg,
                  }}
                />
                <span>{creator}</span>
              </span>
            ))}
          </div>
        )}
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
