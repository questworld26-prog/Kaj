// [spec: TG-001]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
import type { DatabaseSync } from "node:sqlite";
import {
  formatLocalDateYMD,
  isActionDateToday,
  type Task,
} from "../../shared/types.js";
import type { ProjectRepository, TaskRepository } from "../repository.js";
import { formatDailyBriefTaskList } from "./formatters.js";
import type {
  DailyDigestResult,
  TelegramApiTransport,
  TelegramConfig,
} from "./types.js";

/**
 * Determine whether a creator string or user identifier is designated as VIP.
 */
// [spec: TG-001]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
export function isVipUser(
  creator: string | null | undefined,
  vipUsers?: string[],
): boolean {
  if (!creator || !creator.trim()) return false;
  const raw = creator.trim();
  if (/\[vip\]|\(vip\)|\bvip\b/i.test(raw)) return true;
  if (!vipUsers || vipUsers.length === 0) return false;
  const lower = raw.toLowerCase();
  return vipUsers.some((v) => v.toLowerCase() === lower);
}

/**
 * Collect allowed Telegram numeric recipient IDs excluding all VIP users.
 */
// [spec: NOTIF-002]
export function resolveNonVipRecipients(config: TelegramConfig): number[] {
  const candidates: number[] = [];
  if (config.allowed_user_ids.length > 0) {
    for (const uid of config.allowed_user_ids) {
      if (Number.isFinite(uid) && uid > 0 && !candidates.includes(uid)) {
        candidates.push(uid);
      }
    }
  } else if (config.user_names) {
    for (const idStr of Object.keys(config.user_names)) {
      const parsed = Number(idStr);
      if (
        Number.isInteger(parsed) &&
        parsed > 0 &&
        !candidates.includes(parsed)
      ) {
        candidates.push(parsed);
      }
    }
  }

  return candidates.filter((uid) => {
    const idStr = String(uid);
    const mappedName = config.user_names?.[idStr];
    return (
      !isVipUser(idStr, config.vip_users) &&
      !isVipUser(mappedName, config.vip_users)
    );
  });
}

/**
 * Resolve the display name of the primary configured non-VIP Telegram member
 * for attributing unspecified creator entries on telemetry charts.
 */
// [spec: UI-012]
export function resolveDefaultNonVipCreatorName(
  config: TelegramConfig,
): string | null {
  const nonVipIds = resolveNonVipRecipients(config);
  for (const uid of nonVipIds) {
    const mapped = config.user_names?.[String(uid)]?.trim();
    if (mapped) return mapped;
  }
  if (config.user_names) {
    for (const [k, v] of Object.entries(config.user_names)) {
      const name = v?.trim();
      if (
        name &&
        !isVipUser(k, config.vip_users) &&
        !isVipUser(name, config.vip_users)
      ) {
        return name;
      }
    }
  }
  if (nonVipIds.length > 0) {
    return String(nonVipIds[0]);
  }
  return null;
}

/**
 * Parse local wall-clock digest threshold `HH:mm` into minutes since midnight (defaults to 08:00 = 480).
 */
// [spec: NOTIF-002]
export function isPastDigestTime(
  now: Date = new Date(),
  digestTime = "08:00",
): boolean {
  const match = digestTime.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const targetMinutes = match
    ? Number(match[1]) * 60 + Number(match[2])
    : 8 * 60;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= targetMinutes;
}

/**
 * Filter active In Progress Today tasks ordered strictly with `action_date === today` at top,
 * followed by remaining `in_progress_today` tasks.
 */
// [spec: NOTIF-002]
export function selectDailyDigestTasks(
  tasks: ReadonlyArray<Task>,
  todayYmd: string,
  maxItems = 15,
): { items: Task[]; totalCount: number; truncatedCount: number } {
  const eligible = tasks.filter(
    (t) => t.deleted_at === null && t.status === "in_progress_today",
  );

  const tierRank = (t: Task): number =>
    isActionDateToday(t.action_date, todayYmd) ? 0 : 1;

  const sorted = [...eligible].sort((a, b) => {
    const rankDiff = tierRank(a) - tierRank(b);
    if (rankDiff !== 0) return rankDiff;
    const sortDiff = a.sort_order - b.sort_order;
    if (sortDiff !== 0) return sortDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  const limit = Math.max(1, Math.floor(maxItems));
  const items = sorted.slice(0, limit);
  return {
    items,
    totalCount: sorted.length,
    truncatedCount: Math.max(0, sorted.length - items.length),
  };
}

function hasDigestBeenSent(
  digestKey: string,
  db: DatabaseSync | undefined,
  memorySentKeys: Set<string>,
): boolean {
  if (memorySentKeys.has(digestKey)) return true;
  if (!db) return false;
  const row = db
    .prepare(
      "SELECT 1 as found FROM telegram_digest_dispatches WHERE digest_key = ?",
    )
    .get(digestKey) as { found: number } | undefined;
  return Boolean(row?.found);
}

function markDigestAsSent(
  digestKey: string,
  sentAtIso: string,
  db: DatabaseSync | undefined,
  memorySentKeys: Set<string>,
): void {
  memorySentKeys.add(digestKey);
  if (!db) return;
  db.prepare(
    `INSERT OR REPLACE INTO telegram_digest_dispatches (digest_key, sent_at)
     VALUES (?, ?)`,
  ).run(digestKey, sentAtIso);
}

export interface DispatchDailyDigestOptions {
  config: TelegramConfig;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  transport: TelegramApiTransport;
  db?: DatabaseSync;
  memorySentKeys: Set<string>;
  force?: boolean;
  now?: Date;
}

/**
 * Send today's concise In Progress Today digest once per calendar day to each non-VIP recipient.
 */
// [spec: NOTIF-002]
export async function dispatchDailyNonVipDigest(
  options: DispatchDailyDigestOptions,
): Promise<DailyDigestResult> {
  const {
    config,
    taskRepo,
    projectRepo,
    transport,
    db,
    memorySentKeys,
    force = false,
    now = new Date(),
  } = options;

  const hasValidToken = Boolean(
    config.bot_token && config.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN",
  );
  if (!config.enabled || !hasValidToken) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: 0,
      skipped_reason: "telegram_disabled",
    };
  }

  if (!force && !config.daily_digest_enabled) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: 0,
      skipped_reason: "digest_disabled",
    };
  }

  if (!force && !isPastDigestTime(now, config.daily_digest_time || "08:00")) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: 0,
      skipped_reason: "before_time",
    };
  }

  const nonVipRecipients = resolveNonVipRecipients(config);
  if (nonVipRecipients.length === 0) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: 0,
      skipped_reason: "no_nonvip_recipients",
    };
  }

  const todayYmd = formatLocalDateYMD(now);
  const maxItems = config.daily_digest_max_items ?? 15;
  const { items, totalCount, truncatedCount } = selectDailyDigestTasks(
    taskRepo.listTasks(false),
    todayYmd,
    maxItems,
  );

  const skipEmpty = config.daily_digest_skip_empty ?? true;
  if (totalCount === 0 && skipEmpty) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: 0,
      skipped_reason: "empty",
    };
  }

  const pendingRecipients = nonVipRecipients.filter((uid) => {
    if (force) return true;
    const key = `nonvip_daily:${todayYmd}:${uid}`;
    return !hasDigestBeenSent(key, db, memorySentKeys);
  });

  if (pendingRecipients.length === 0) {
    return {
      dispatched_count: 0,
      recipients: [],
      task_count: totalCount,
      skipped_reason: "already_dispatched",
    };
  }

  const projects = projectRepo.listProjects(false);
  const messageText = formatDailyBriefTaskList(
    items,
    projects,
    todayYmd,
    maxItems,
    truncatedCount,
  );

  const sentTo: number[] = [];
  const sentAtIso = now.toISOString();
  for (const chatId of pendingRecipients) {
    try {
      await transport.sendMessage(chatId, messageText);
      markDigestAsSent(`nonvip_daily:${todayYmd}:${chatId}`, sentAtIso, db, memorySentKeys);
      sentTo.push(chatId);
    } catch {
      // Leave unmarked so failed delivery retries cleanly on next scheduler tick
    }
  }

  return {
    dispatched_count: sentTo.length,
    recipients: sentTo,
    task_count: totalCount,
  };
}
