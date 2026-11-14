// [spec: TG-001]
import fs from "node:fs";
import path from "node:path";
import { TASK_STATUSES, type TaskStatus } from "../../shared/types.js";
import type { TelegramConfig } from "./types.js";

export const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: "",
  allowed_user_ids: [],
  notify_on_completion: true,
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

function mergeUserNamesAndVips(
  rawMap: unknown,
  userNames: Record<string, string>,
  vipUsersSet: Set<string>,
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
      const obj = v as { name: string; vip?: boolean; is_vip?: boolean };
      const cleanName = obj.name.trim();
      userNames[keyStr] = cleanName;
      if (obj.vip === true || obj.is_vip === true) {
        vipUsersSet.add(cleanName);
        vipUsersSet.add(keyStr);
      }
    }
  }
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

  const legacyFile = fileData as {
    vip_users?: unknown[];
    vip_user_names?: unknown[];
  };
  addExplicitVips(
    legacyFile.vip_users || legacyFile.vip_user_names,
    vipUsersSet,
  );
  mergeUserNamesAndVips(fileData.user_names, userNames, vipUsersSet);

  if (env.KAJ_TELEGRAM_USER_NAMES) {
    try {
      const parsedNames = JSON.parse(env.KAJ_TELEGRAM_USER_NAMES);
      mergeUserNamesAndVips(parsedNames, userNames, vipUsersSet);
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
    vip_users: vipUsersSet.size > 0 ? Array.from(vipUsersSet) : undefined,
    notify_on_completion:
      typeof fileData.notify_on_completion === "boolean"
        ? fileData.notify_on_completion
        : DEFAULT_CONFIG.notify_on_completion,
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

  upsertEnvFileVars(targetEnvPath, envUpdates);
  return loadTelegramConfig(undefined, env);
}
