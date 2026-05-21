/**
 * Telegram prompt injection helpers
 * Zones: pi agent prompts, telegram guidance
 * Owns Telegram-specific system prompt suffixes injected into pi agent turns
 *
 * Features:
 * - LLM-native handling for non-English messages (no external translation API)
 * - Debug logging with auto-prune
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BeforeAgentStartEvent } from "./pi.ts";
import { TELEGRAM_PREFIX } from "./turns.ts";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_DIR = join(homedir(), ".pi", "agent", "logs");
export const LOG_FILE = join(LOG_DIR, "telegram-bridge.log");
export const MAX_LOG_ENTRIES = 200;

export function logTelegramBridgePrompt(options: {
  timestamp: string;
  originalPrompt: string;
  systemPromptSuffix: string;
}): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(
      LOG_FILE,
      JSON.stringify({
        ts: options.timestamp,
        prompt: options.originalPrompt.slice(0, 500),
        suffix: options.systemPromptSuffix.slice(0, 300),
      }) + "\n",
      "utf-8",
    );
  } catch {
    /* silent */
  }
}

export function pruneTelegramBridgeLogs(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    const lines = readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length <= MAX_LOG_ENTRIES) return;
    const pruned = lines.slice(lines.length - MAX_LOG_ENTRIES).join("\n") + "\n";
    writeFileSync(LOG_FILE, pruned, "utf-8");
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// System prompt suffix
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_SUFFIX = `

Telegram bridge extension is active.

Inbound context:
- \`[telegram]\` marks Telegram-originated messages.
- \`[reply]\` is quoted context from the replied-to message, not a new instruction by itself. Use it to resolve references like "this", "it", or "that message"; the actual instruction is before [reply] unless it explicitly asks to act on the quote.
- \`[attachments]\` gives a base directory plus relative local files; resolve and read them as needed. \`[outputs]\` contains inbound-handler stdout such as transcriptions or extracted text for those attachments.
- Unknown \`[callback] ...\` messages may be intended for another extension; if you see one, say the callback was not handled and the environment may be misconfigured.

Telegram-visible output:
- Telegram is often phone-width; prefer narrow table columns because wide monospace tables can become unreadable.
- For requested/generated files, call tool \`telegram_attach(local_path)\`; mentioning a local path in text does not send it.

Native outbound actions:
- Use top-level column-zero hidden Markdown comments outside code, quotes, and lists; the bridge handles them after agent_end, so do not call or register transport/TTS/text-to-OGG tools.
- \`telegram_voice\`: text is synthesized through the configured outbound-handler pipeline. Use body text for multiline voice, \`<!-- telegram_voice text="Short summary" -->\` for explicit one-line voice, or \`<!-- telegram_voice: Short summary -->\` for one-line voice with no attributes. A companion summary is optional, no specific summary format is required. Keep it TTS-friendly; avoid raw Markdown, code, formulas, tables, or long lists.
- \`telegram_button\`: callback prompt is routed back as a normal Telegram turn. Use \`<!-- telegram_button: OK -->\` when prompt equals label, \`<!-- telegram_button label=Continue prompt="Continue with the current plan." -->\` for one-line prompts, or body form \`<!-- telegram_button label="Show risks"\nList the main risks first.\n-->\` for multiline prompts.
- If only hidden action comments would remain, add visible parent text like "Choose one:".
`;

const TELEGRAM_TRANSLATION_LINE = `\n- The current user message came from Telegram.`;

// ---------------------------------------------------------------------------
// Telegram prefix detection
// ---------------------------------------------------------------------------

/** Extract the raw message text by stripping the Telegram prefix */
function extractTelegramMessage(prompt: string): string | null {
  const trimmed = prompt.trimStart();
  if (trimmed.startsWith(TELEGRAM_PREFIX)) {
    return trimmed.slice(TELEGRAM_PREFIX.length).trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main exported functions
// ---------------------------------------------------------------------------

export function buildTelegramBridgeSystemPrompt(options: {
  prompt: string;
  systemPrompt: string;
  telegramPrefix?: string;
  systemPromptSuffix: string;
}): { systemPrompt: string } {
  const telegramPrefix = options.telegramPrefix ?? TELEGRAM_PREFIX;
  const suffix = options.prompt.trimStart().startsWith(telegramPrefix)
    ? `${options.systemPromptSuffix}${TELEGRAM_TRANSLATION_LINE}`
    : options.systemPromptSuffix;
  return { systemPrompt: options.systemPrompt + suffix };
}

/**
 * Create a before-agent-start hook that appends Telegram-specific
 * instructions to the system prompt for Telegram-originated messages.
 * No external translation API used — the LLM handles non-English
 * messages natively.
 */
export function createTelegramBeforeAgentStartHook(
  options: { telegramPrefix?: string; systemPromptSuffix?: string } = {},
): (event: BeforeAgentStartEvent) => { systemPrompt: string } {
  pruneTelegramBridgeLogs();

  return (event: BeforeAgentStartEvent) => {
    const baseSuffix = options.systemPromptSuffix ?? SYSTEM_PROMPT_SUFFIX;
    const isTelegram = event.prompt.trimStart().startsWith(options.telegramPrefix ?? TELEGRAM_PREFIX);

    const suffix = isTelegram
      ? `${baseSuffix}${TELEGRAM_TRANSLATION_LINE}`
      : baseSuffix;

    logTelegramBridgePrompt({
      timestamp: new Date().toISOString(),
      originalPrompt: event.prompt,
      systemPromptSuffix: suffix,
    });

    return { systemPrompt: event.systemPrompt + suffix };
  };
}
