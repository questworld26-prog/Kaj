// [spec: TG-001]
import fs from "node:fs";
import path from "node:path";
import { TASK_STATUSES } from "../../shared/types.js";
import type { TelegramConfig } from "./types.js";

export const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: "",
  allowed_user_ids: [],
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
      // Ignore malformed JSON and fall back to defaults
    }
  }

  const defaultStatus =
    fileData.default_status &&
    (TASK_STATUSES as readonly string[]).includes(fileData.default_status)
      ? fileData.default_status
      : DEFAULT_CONFIG.default_status;

  const userNames: Record<string, string> = {};
  if (
    fileData.user_names &&
    typeof fileData.user_names === "object" &&
    !Array.isArray(fileData.user_names)
  ) {
    for (const [k, v] of Object.entries(fileData.user_names)) {
      if (typeof v === "string" && v.trim()) {
        userNames[String(k).trim()] = v.trim();
      }
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
    allowed_user_ids: Array.isArray(fileData.allowed_user_ids)
      ? fileData.allowed_user_ids
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
      : [...DEFAULT_CONFIG.allowed_user_ids],
    user_names: Object.keys(userNames).length > 0 ? userNames : undefined,
    default_status: defaultStatus,
    poll_interval_ms:
      typeof fileData.poll_interval_ms === "number" &&
      fileData.poll_interval_ms >= 50
        ? fileData.poll_interval_ms
        : DEFAULT_CONFIG.poll_interval_ms,
  };

  if (env.KAJ_TELEGRAM_ENABLED !== undefined) {
    const val = env.KAJ_TELEGRAM_ENABLED.trim().toLowerCase();
    if (val === "true" || val === "1" || val === "on") {
      config.enabled = true;
    } else if (val === "false" || val === "0" || val === "off") {
      config.enabled = false;
    }
  }

  if (env.KAJ_TELEGRAM_BOT_TOKEN) {
    config.bot_token = env.KAJ_TELEGRAM_BOT_TOKEN.trim();
  }

  return config;
}

export function saveTelegramConfig(
  updates: Partial<TelegramConfig>,
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const resolvedPath = resolveTelegramConfigPath(configPath, env);
  const current = loadTelegramConfig(resolvedPath, {});
  const next: TelegramConfig = {
    ...current,
    ...updates,
  };
  fs.writeFileSync(resolvedPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return loadTelegramConfig(resolvedPath, env);
}
