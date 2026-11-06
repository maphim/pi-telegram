/**
 * Telegram session list / switch / new helpers
 * Zones: telegram ui, pi agent state, restart markers
 * Owns session-file discovery, owner-facing listing text, /resume target
 * resolution, and the restart-marker contract consumed by the bridge wrapper.
 */

import * as fs from "node:fs";
import { join } from "node:path";

export const TELEGRAM_SESSION_SWITCH_MARKER_FILE =
  "/tmp/pi-telegram-session.json";
export const TELEGRAM_SESSION_LIST_LIMIT = 10;
export const TELEGRAM_SESSION_ID_MIN_PREFIX = 4;

export type TelegramSessionSwitchMode = "new" | "session";

export interface TelegramSessionEntry {
  filePath: string;
  fileName: string;
  id: string;
  startedAt: Date;
  mtimeMs: number;
  bytes: number;
}

const SESSION_FILE_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** Session files are named `<timestamp>_<uuid>.jsonl` by pi. */
export function parseTelegramSessionFileName(
  fileName: string,
): { startedAt: Date; id: string } | undefined {
  const match = SESSION_FILE_PATTERN.exec(fileName);
  if (!match) return undefined;
  const startedAt = new Date(
    match[1].replace(
      /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
      "T$1:$2:$3.$4Z",
    ),
  );
  if (Number.isNaN(startedAt.getTime())) return undefined;
  return { startedAt, id: match[2] };
}

export function formatTelegramSessionStartedAt(startedAt: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(startedAt.getHours())}:${pad(startedAt.getMinutes())} ${pad(
    startedAt.getDate(),
  )}/${pad(startedAt.getMonth() + 1)}`;
}

export function formatTelegramSessionBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** First user message text found in raw session lines (JSONL), if any. */
export function extractTelegramSessionPreview(
  lines: readonly string[],
): string | undefined {
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = parsed as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (record.type !== "message" || record.message?.role !== "user") {
      continue;
    }
    const content = record.message.content;
    const parts: string[] = [];
    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      return text.length > 80 ? `${text.slice(0, 77)}...` : text;
    }
  }
  return undefined;
}

export function readTelegramSessionPreview(
  filePath: string,
  maxLines = 200,
): string | undefined {
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").slice(0, maxLines);
    return extractTelegramSessionPreview(lines);
  } catch {
    return undefined;
  }
}

/** Session files in the directory, most recently active first. */
export function listTelegramSessions(
  sessionDir: string,
): TelegramSessionEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(sessionDir);
  } catch {
    return [];
  }
  const entries: TelegramSessionEntry[] = [];
  for (const fileName of names) {
    const parsed = parseTelegramSessionFileName(fileName);
    if (!parsed) continue;
    const filePath = join(sessionDir, fileName);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    entries.push({
      filePath,
      fileName,
      id: parsed.id,
      startedAt: parsed.startedAt,
      mtimeMs: stat.mtimeMs,
      bytes: stat.size,
    });
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries;
}

export interface TelegramSessionListOptions {
  limit?: number;
  currentFile?: string;
  readPreview?: (filePath: string) => string | undefined;
}

export function buildTelegramSessionListText(
  entries: readonly TelegramSessionEntry[],
  options: TelegramSessionListOptions = {},
): string {
  const limit = options.limit ?? TELEGRAM_SESSION_LIST_LIMIT;
  const shown = entries.slice(0, limit);
  if (shown.length === 0) {
    return "Chưa có session nào trong thư mục. Gõ /new để mở session mới.";
  }
  const readPreview = options.readPreview ?? readTelegramSessionPreview;
  const lines = [`📚 Sessions gần nhất (${shown.length}):`];
  shown.forEach((entry, index) => {
    const current =
      options.currentFile === entry.filePath ? " · (đang dùng)" : "";
    lines.push(
      `${index + 1}) ${formatTelegramSessionStartedAt(entry.startedAt)} · ${formatTelegramSessionBytes(entry.bytes)} · ${entry.id.slice(0, 8)}${current}`,
    );
    const preview = readPreview(entry.filePath);
    if (preview) lines.push(`   "${preview}"`);
  });
  lines.push(
    "Chuyển: /resume <số|id> · Mở mới: /new (session cũ vẫn giữ nguyên).",
  );
  return lines.join("\n");
}

export type TelegramSessionChoice =
  | { kind: "found"; entry: TelegramSessionEntry }
  | { kind: "missing" }
  | { kind: "invalid" };

/** Accepts a 1-based list index or a uuid prefix (>= 4 chars). */
export function resolveTelegramSessionChoice(
  entries: readonly TelegramSessionEntry[],
  input: string,
): TelegramSessionChoice {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid" };
  if (/^\d+$/.test(trimmed)) {
    const entry = entries[Number(trimmed) - 1];
    return entry ? { kind: "found", entry } : { kind: "missing" };
  }
  if (trimmed.length < TELEGRAM_SESSION_ID_MIN_PREFIX) {
    return { kind: "invalid" };
  }
  const lower = trimmed.toLowerCase();
  const matches = entries.filter(
    (entry) =>
      entry.id.toLowerCase().startsWith(lower) ||
      entry.fileName.toLowerCase().includes(lower),
  );
  if (matches.length === 1) return { kind: "found", entry: matches[0] };
  return matches.length === 0 ? { kind: "missing" } : { kind: "invalid" };
}

/** Restart-marker contract read by ~/.pi/telegram-wrapper.sh. */
export function buildTelegramSessionSwitchMarker(
  mode: TelegramSessionSwitchMode,
  sessionPath?: string,
): string {
  return JSON.stringify(
    mode === "session" ? { mode, session: sessionPath } : { mode },
  );
}

export function writeTelegramSessionSwitchMarker(
  mode: TelegramSessionSwitchMode,
  sessionPath?: string,
): void {
  fs.writeFileSync(
    TELEGRAM_SESSION_SWITCH_MARKER_FILE,
    buildTelegramSessionSwitchMarker(mode, sessionPath),
    "utf8",
  );
}
