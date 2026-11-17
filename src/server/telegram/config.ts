// [spec: TG-001]
// [spec: NOTIF-002]
// [spec: NOTIF-003]
import fs from "node:fs";
import path from "node:path";
import { TASK_STATUSES, type TaskStatus } from "../../shared/types.js";
import {
  TELEGRAM_NOTIFICATION_TYPES,
  type TelegramConfig,
  type TelegramNotificationType,
} from "./types.js";

export const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: "",
  allowed_user_ids: [],
  notify_on_completion: true,
  daily_digest_enabled: false,
  daily_digest_time: "08:00",
  daily_digest_max_items: 15,
  daily_digest_skip_empty: true,
  default_status: "triage",
  poll_interval_ms: 2000,
};

export function resolveTelegramConfigPath(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (configPath) return path.resolve(configPath);
  if (env.KAJ_TELEGRAM_CONFIG) return path.resolve(env.KAJ_TELEGRAM_CONFIG);
  return path.resolve("./telegram.config.json");
}

function parseBooleanFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const val = raw.trim().toLowerCase();
  if (val === "true" || val === "1" || val === "on") return true;
  if (val === "false" || val === "0" || val === "off") return false;
  return undefined;
}

function parseAllowedUserIds(raw: string): number[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n));
      }
    } catch {
      // Fall back to comma-separated parsing
    }
  }
  return trimmed
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

function parseVipList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // Fall back to comma-separated parsing
    }
  }
  return trimmed
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function addExplicitVips(explicitVips: unknown, vipUsersSet: Set<string>): void {
  if (!Array.isArray(explicitVips)) return;
  for (const v of explicitVips) {
    if (typeof v === "string" && v.trim()) vipUsersSet.add(v.trim());
    else if (typeof v === "number") vipUsersSet.add(String(v));
  }
}

function normalizeNotificationList(
  rawList: unknown[],
): TelegramNotificationType[] {
  const valid = new Set<string>(TELEGRAM_NOTIFICATION_TYPES);
  const result: TelegramNotificationType[] = [];
  for (const item of rawList) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (
      valid.has(key) &&
      !result.includes(key as TelegramNotificationType)
    ) {
      result.push(key as TelegramNotificationType);
    }
  }
  return result;
}

function mergeUserNamesAndVips(
  rawMap: unknown,
  userNames: Record<string, string>,
  vipUsersSet: Set<string>,
  userNotifications: Record<string, TelegramNotificationType[]>,
): void {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return;

  for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
    const keyStr = String(k).trim();
    if (!keyStr) continue;

    if (typeof v === "string" && v.trim()) {
      const raw = v.trim();
      const isVipString = /\[vip\]|\(vip\)|\bvip\b/i.test(raw);
      if (isVipString) {
        const clean = raw
          .replace(/\[\s*vip\s*\]/gi, "")
          .replace(/\(\s*vip\s*\)/gi, "")
          .replace(/^vip[:\s-]+/gi, "")
          .replace(/[\s-]+vip$/gi, "")
          .trim();
        userNames[keyStr] = clean || raw;
        vipUsersSet.add(clean || raw);
        vipUsersSet.add(keyStr);
      } else {
        userNames[keyStr] = raw;
      }
    } else if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      "name" in v &&
      typeof (v as { name: unknown }).name === "string"
    ) {
      const obj = v as {
        name: string;
        vip?: boolean;
        is_vip?: boolean;
        notifications?: unknown;
      };
      const cleanName = obj.name.trim();
      userNames[keyStr] = cleanName;
      if (obj.vip === true || obj.is_vip === true) {
        vipUsersSet.add(cleanName);
        vipUsersSet.add(keyStr);
      }
      if (Array.isArray(obj.notifications)) {
        userNotifications[keyStr] = normalizeNotificationList(obj.notifications);
      }
    }
  }
}

function isVipIdentity(
  keyStr: string,
  userNames: Record<string, string>,
  vipUsersSet: Set<string>,
): boolean {
  const mappedName = userNames[keyStr];
  const vipLower = new Set(Array.from(vipUsersSet).map((v) => v.toLowerCase()));
  if (vipLower.has(keyStr.toLowerCase())) return true;
  if (mappedName) {
    if (/\[vip\]|\(vip\)|\bvip\b/i.test(mappedName)) return true;
    if (vipLower.has(mappedName.toLowerCase())) return true;
  }
  return false;
}

function finalizeUserNotifications(
  allowedUserIds: number[],
  userNames: Record<string, string>,
  vipUsersSet: Set<string>,
  explicitNotifications: Record<string, TelegramNotificationType[]>,
): Record<string, TelegramNotificationType[]> | undefined {
  const keys = new Set<string>([
    ...allowedUserIds.map((id) => String(id)),
    ...Object.keys(userNames),
    ...Object.keys(explicitNotifications),
  ]);
  if (keys.size === 0) return undefined;

  const resolved: Record<string, TelegramNotificationType[]> = {};
  for (const keyStr of keys) {
    if (Object.prototype.hasOwnProperty.call(explicitNotifications, keyStr)) {
      resolved[keyStr] = [...explicitNotifications[keyStr]];
    } else if (isVipIdentity(keyStr, userNames, vipUsersSet)) {
      resolved[keyStr] = ["task_completed", "task_triaged"];
    } else {
      resolved[keyStr] = ["task_completed", "daily_digest", "backup_status"];
    }
  }
  return resolved;
}

function upsertEnvFileVars(
  envFilePath: string,
  updates: Record<string, string>,
): void {
  const existing = fs.existsSync(envFilePath)
    ? fs.readFileSync(envFilePath, "utf-8")
    : "";
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));

  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const val = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${val}`;
  });

  if (remaining.size > 0) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
      nextLines.push("");
    }
    for (const [key, val] of remaining.entries()) {
      nextLines.push(`${key}=${val}`);
    }
  }

  const normalized = nextLines.join("\n").replace(/\n*$/, "\n");
  fs.writeFileSync(envFilePath, normalized, "utf-8");
}

export function loadTelegramConfig(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const resolvedPath = resolveTelegramConfigPath(configPath, env);
  let fileData: Partial<TelegramConfig> = {};

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, "utf-8");
      fileData = JSON.parse(raw) as Partial<TelegramConfig>;
    } catch {
      // Ignore malformed JSON and fall back to env/defaults
    }
  }

  let defaultStatus: TaskStatus =
    fileData.default_status &&
    (TASK_STATUSES as readonly string[]).includes(fileData.default_status)
      ? fileData.default_status
      : DEFAULT_CONFIG.default_status;

  if (
    env.KAJ_TELEGRAM_DEFAULT_STATUS &&
    (TASK_STATUSES as readonly string[]).includes(
      env.KAJ_TELEGRAM_DEFAULT_STATUS.trim(),
    )
  ) {
    defaultStatus = env.KAJ_TELEGRAM_DEFAULT_STATUS.trim() as TaskStatus;
  }

  const userNames: Record<string, string> = {};
  const vipUsersSet = new Set<string>();
  const explicitNotifications: Record<string, TelegramNotificationType[]> = {};

  const legacyFile = fileData as {
    vip_users?: unknown[];
    vip_user_names?: unknown[];
    user_notifications?: Record<string, unknown>;
  };
  addExplicitVips(
    legacyFile.vip_users || legacyFile.vip_user_names,
    vipUsersSet,
  );
  mergeUserNamesAndVips(
    fileData.user_names,
    userNames,
    vipUsersSet,
    explicitNotifications,
  );
  if (
    legacyFile.user_notifications &&
    typeof legacyFile.user_notifications === "object"
  ) {
    for (const [k, rawList] of Object.entries(legacyFile.user_notifications)) {
      if (Array.isArray(rawList)) {
        explicitNotifications[k.trim()] = normalizeNotificationList(rawList);
      }
    }
  }

  if (env.KAJ_TELEGRAM_USER_NAMES) {
    try {
      const parsedNames = JSON.parse(env.KAJ_TELEGRAM_USER_NAMES);
      mergeUserNamesAndVips(
        parsedNames,
        userNames,
        vipUsersSet,
        explicitNotifications,
      );
    } catch {
      // Ignore malformed KAJ_TELEGRAM_USER_NAMES JSON
    }
  }

  if (env.KAJ_TELEGRAM_VIP_USERS) {
    for (const vip of parseVipList(env.KAJ_TELEGRAM_VIP_USERS)) {
      vipUsersSet.add(vip);
    }
  }

  const allowedUserIds =
    env.KAJ_TELEGRAM_ALLOWED_USER_IDS !== undefined
      ? parseAllowedUserIds(env.KAJ_TELEGRAM_ALLOWED_USER_IDS)
      : Array.isArray(fileData.allowed_user_ids)
        ? fileData.allowed_user_ids
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n))
        : [...DEFAULT_CONFIG.allowed_user_ids];

  let pollIntervalMs =
    typeof fileData.poll_interval_ms === "number" &&
    fileData.poll_interval_ms >= 50
      ? fileData.poll_interval_ms
      : DEFAULT_CONFIG.poll_interval_ms;

  if (env.KAJ_TELEGRAM_POLL_INTERVAL_MS !== undefined) {
    const parsedInterval = Number(env.KAJ_TELEGRAM_POLL_INTERVAL_MS.trim());
    if (Number.isFinite(parsedInterval) && parsedInterval >= 50) {
      pollIntervalMs = parsedInterval;
    }
  }

  const resolvedUserNotifications = finalizeUserNotifications(
    allowedUserIds,
    userNames,
    vipUsersSet,
    explicitNotifications,
  );

  const config: TelegramConfig = {
    enabled:
      typeof fileData.enabled === "boolean"
        ? fileData.enabled
        : DEFAULT_CONFIG.enabled,
    bot_token:
      typeof fileData.bot_token === "string"
        ? fileData.bot_token.trim()
        : DEFAULT_CONFIG.bot_token,
    allowed_user_ids: allowedUserIds,
    user_names: Object.keys(userNames).length > 0 ? userNames : undefined,
    user_notifications: resolvedUserNotifications,
    vip_users: vipUsersSet.size > 0 ? Array.from(vipUsersSet) : undefined,
    notify_on_completion:
      typeof fileData.notify_on_completion === "boolean"
        ? fileData.notify_on_completion
        : DEFAULT_CONFIG.notify_on_completion,
    daily_digest_enabled:
      typeof fileData.daily_digest_enabled === "boolean"
        ? fileData.daily_digest_enabled
        : DEFAULT_CONFIG.daily_digest_enabled,
    daily_digest_time:
      typeof fileData.daily_digest_time === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(fileData.daily_digest_time.trim())
        ? fileData.daily_digest_time.trim()
        : DEFAULT_CONFIG.daily_digest_time,
    daily_digest_max_items:
      typeof fileData.daily_digest_max_items === "number" &&
      Number.isInteger(fileData.daily_digest_max_items) &&
      fileData.daily_digest_max_items >= 1 &&
      fileData.daily_digest_max_items <= 50
        ? fileData.daily_digest_max_items
        : DEFAULT_CONFIG.daily_digest_max_items,
    daily_digest_skip_empty:
      typeof fileData.daily_digest_skip_empty === "boolean"
        ? fileData.daily_digest_skip_empty
        : DEFAULT_CONFIG.daily_digest_skip_empty,
    default_status: defaultStatus,
    poll_interval_ms: pollIntervalMs,
  };

  const envEnabled = parseBooleanFlag(env.KAJ_TELEGRAM_ENABLED);
  if (envEnabled !== undefined) {
    config.enabled = envEnabled;
  }

  if (env.KAJ_TELEGRAM_BOT_TOKEN) {
    config.bot_token = env.KAJ_TELEGRAM_BOT_TOKEN.trim();
  }

  const envNotify = parseBooleanFlag(env.KAJ_TELEGRAM_NOTIFY_COMPLETION);
  if (envNotify !== undefined) {
    config.notify_on_completion = envNotify;
  }

  const envDigestEnabled = parseBooleanFlag(env.KAJ_TELEGRAM_DAILY_DIGEST_ENABLED);
  if (envDigestEnabled !== undefined) {
    config.daily_digest_enabled = envDigestEnabled;
  }

  if (
    env.KAJ_TELEGRAM_DAILY_DIGEST_TIME &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(env.KAJ_TELEGRAM_DAILY_DIGEST_TIME.trim())
  ) {
    config.daily_digest_time = env.KAJ_TELEGRAM_DAILY_DIGEST_TIME.trim();
  }

  if (env.KAJ_TELEGRAM_DAILY_DIGEST_MAX_ITEMS !== undefined) {
    const parsedMax = Number(env.KAJ_TELEGRAM_DAILY_DIGEST_MAX_ITEMS.trim());
    if (Number.isInteger(parsedMax) && parsedMax >= 1 && parsedMax <= 50) {
      config.daily_digest_max_items = parsedMax;
    }
  }

  const envSkipEmpty = parseBooleanFlag(env.KAJ_TELEGRAM_DAILY_DIGEST_SKIP_EMPTY);
  if (envSkipEmpty !== undefined) {
    config.daily_digest_skip_empty = envSkipEmpty;
  }

  return config;
}

export function saveTelegramConfig(
  updates: Partial<TelegramConfig>,
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
  envFilePath?: string,
): TelegramConfig {
  const resolvedJsonPath = resolveTelegramConfigPath(configPath, env);
  const useJsonFile =
    Boolean(configPath) ||
    Boolean(env.KAJ_TELEGRAM_CONFIG) ||
    (!envFilePath && fs.existsSync(resolvedJsonPath));

  if (useJsonFile) {
    const current = loadTelegramConfig(resolvedJsonPath, {});
    const next: TelegramConfig = {
      ...current,
      ...updates,
    };
    fs.writeFileSync(
      resolvedJsonPath,
      JSON.stringify(next, null, 2) + "\n",
      "utf-8",
    );
    return loadTelegramConfig(resolvedJsonPath, env);
  }

  const targetEnvPath = envFilePath
    ? path.resolve(envFilePath)
    : path.resolve("./.env");
  const envUpdates: Record<string, string> = {};

  if (typeof updates.enabled === "boolean") {
    const val = updates.enabled ? "true" : "false";
    env.KAJ_TELEGRAM_ENABLED = val;
    envUpdates.KAJ_TELEGRAM_ENABLED = val;
  }
  if (typeof updates.bot_token === "string") {
    const val = updates.bot_token.trim();
    env.KAJ_TELEGRAM_BOT_TOKEN = val;
    envUpdates.KAJ_TELEGRAM_BOT_TOKEN = JSON.stringify(val);
  }
  if (Array.isArray(updates.allowed_user_ids)) {
    const val = updates.allowed_user_ids.join(",");
    env.KAJ_TELEGRAM_ALLOWED_USER_IDS = val;
    envUpdates.KAJ_TELEGRAM_ALLOWED_USER_IDS = JSON.stringify(val);
  }
  if (updates.default_status) {
    env.KAJ_TELEGRAM_DEFAULT_STATUS = updates.default_status;
    envUpdates.KAJ_TELEGRAM_DEFAULT_STATUS = JSON.stringify(
      updates.default_status,
    );
  }
  if (typeof updates.poll_interval_ms === "number") {
    const val = String(updates.poll_interval_ms);
    env.KAJ_TELEGRAM_POLL_INTERVAL_MS = val;
    envUpdates.KAJ_TELEGRAM_POLL_INTERVAL_MS = val;
  }
  if (typeof updates.notify_on_completion === "boolean") {
    const val = updates.notify_on_completion ? "true" : "false";
    env.KAJ_TELEGRAM_NOTIFY_COMPLETION = val;
    envUpdates.KAJ_TELEGRAM_NOTIFY_COMPLETION = val;
  }
  if (typeof updates.daily_digest_enabled === "boolean") {
    const val = updates.daily_digest_enabled ? "true" : "false";
    env.KAJ_TELEGRAM_DAILY_DIGEST_ENABLED = val;
    envUpdates.KAJ_TELEGRAM_DAILY_DIGEST_ENABLED = val;
  }
  if (
    typeof updates.daily_digest_time === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(updates.daily_digest_time.trim())
  ) {
    const val = updates.daily_digest_time.trim();
    env.KAJ_TELEGRAM_DAILY_DIGEST_TIME = val;
    envUpdates.KAJ_TELEGRAM_DAILY_DIGEST_TIME = JSON.stringify(val);
  }
  if (
    typeof updates.daily_digest_max_items === "number" &&
    Number.isInteger(updates.daily_digest_max_items) &&
    updates.daily_digest_max_items >= 1 &&
    updates.daily_digest_max_items <= 50
  ) {
    const val = String(updates.daily_digest_max_items);
    env.KAJ_TELEGRAM_DAILY_DIGEST_MAX_ITEMS = val;
    envUpdates.KAJ_TELEGRAM_DAILY_DIGEST_MAX_ITEMS = val;
  }
  if (typeof updates.daily_digest_skip_empty === "boolean") {
    const val = updates.daily_digest_skip_empty ? "true" : "false";
    env.KAJ_TELEGRAM_DAILY_DIGEST_SKIP_EMPTY = val;
    envUpdates.KAJ_TELEGRAM_DAILY_DIGEST_SKIP_EMPTY = val;
  }

  upsertEnvFileVars(targetEnvPath, envUpdates);
  return loadTelegramConfig(undefined, env);
}
