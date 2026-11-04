// [spec: UI-004]
import { h } from "preact";
import type { RecurrenceRule } from "../../../shared/types.js";

interface RecurrenceFieldsProps {
  repeatRule: RecurrenceRule;
  repeatDayOfWeek: number | null;
  repeatDayOfMonth: number | null;
  repeatDayOfYear: string | null;
  actionDate: string | null;
  onChangeRule: (rule: RecurrenceRule) => void;
  onChangeDayOfWeek: (day: number) => void;
  onChangeDayOfMonth: (day: number | null) => void;
  onChangeDayOfYear: (doy: string) => void;
}

export function RecurrenceFields({
  repeatRule,
  repeatDayOfWeek,
  repeatDayOfMonth,
  repeatDayOfYear,
  actionDate,
  onChangeRule,
  onChangeDayOfWeek,
  onChangeDayOfMonth,
  onChangeDayOfYear,
}: RecurrenceFieldsProps) {
  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
          Recurrence Rule
        </label>
        <select
          name="repeat_rule"
          value={repeatRule}
          onChange={(e) => {
            const val = (e.target as HTMLSelectElement).value as RecurrenceRule;
            onChangeRule(val);
          }}
          className="w-full px-3 py-2 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
        >
          <option value="none">No Repeat</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Conditional Recurrence Day Option (AC-TASK-002.3) */}
      {repeatRule === "weekly" && (
        <div className="col-span-2 p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
          <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
            Repeat on Day of the Week
          </label>
          <div className="grid grid-cols-7 gap-1">
            {[
              { label: "Sun", day: 0 },
              { label: "Mon", day: 1 },
              { label: "Tue", day: 2 },
              { label: "Wed", day: 3 },
              { label: "Thu", day: 4 },
              { label: "Fri", day: 5 },
              { label: "Sat", day: 6 },
            ].map(({ label, day }) => {
              const isSelected =
                repeatDayOfWeek === day ||
                (repeatDayOfWeek === null &&
                  actionDate &&
                  new Date(actionDate).getUTCDay() === day);
              return (
                <button
                  key={day}
                  type="button"
                  data-testid={`repeat-dow-${day}`}
                  onClick={() => onChangeDayOfWeek(day)}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    isSelected
                      ? "bg-emerald-500 text-black font-bold"
                      : "bg-[#1C2224] text-gray-300 hover:text-white hover:bg-[#252D30]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {repeatRule === "monthly" && (
        <div className="col-span-2 p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
          <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
            Repeat on Day of the Month (1 – 31)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="31"
              name="repeat_day_of_month"
              data-testid="repeat-dom-input"
              value={repeatDayOfMonth ?? ""}
              placeholder={actionDate ? actionDate.split("-")[2] : "1"}
              onChange={(e) => {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                onChangeDayOfMonth(
                  isNaN(val) || val < 1 || val > 31 ? null : val,
                );
              }}
              className="w-24 px-3 py-1.5 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-xs text-gray-400">
              Day of every month (e.g. 1st, 15th, 31st with month-end clamping)
            </span>
          </div>
        </div>
      )}

      {repeatRule === "yearly" && (
        <div className="col-span-2 p-3 rounded-xl bg-[#181E20] border border-[#2A3235]">
          <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
            Repeat on Day of the Year
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              name="repeat_day_of_year_picker"
              data-testid="repeat-doy-picker"
              value={
                repeatDayOfYear
                  ? `2026-${repeatDayOfYear}`
                  : actionDate || "2026-01-01"
              }
              onChange={(e) => {
                const val = (e.target as HTMLInputElement).value;
                if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                  onChangeDayOfYear(val.slice(5));
                }
              }}
              className="w-40 px-3 py-1.5 rounded-xl bg-[#1C2224] border border-[#2A3235] text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-xs text-gray-400">
              Recurs annually on this month and day (
              {repeatDayOfYear || (actionDate ? actionDate.slice(5) : "MM-DD")})
            </span>
          </div>
        </div>
      )}
    </>
  );
}
