// [spec: TG-001]
import type {
  TelegramApiTransport,
  TelegramUpdate,
} from "./types.js";

export function createFetchTelegramTransport(
  botToken: string,
): TelegramApiTransport {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  return {
    async getUpdates(offset: number, timeoutSec: number) {
      const res = await fetch(
        `${baseUrl}/getUpdates?offset=${offset}&timeout=${timeoutSec}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        ok: boolean;
        result?: TelegramUpdate[];
      };
      return data.ok && Array.isArray(data.result) ? data.result : [];
    },

    async sendMessage(chatId, text, replyMarkup) {
      await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await fetch(`${baseUrl}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          ...(text ? { text } : {}),
        }),
      });
    },

    async setMyCommands(commands, scope) {
      await fetch(`${baseUrl}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands,
          ...(scope ? { scope } : {}),
        }),
      });
    },
  };
}
