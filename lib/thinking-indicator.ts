/**
 * Thinking indicator — edit-in-place status message during LLM reasoning
 * Zones: telegram ui, progress indication, reasoning feedback
 * Owns sending, updating, and cleaning up a status message that shows
 * elapsed time, tool calls, and phases while the LLM is processing.
 *
 * Terminal-like display:
 *   🧠 Reasoning… (5s)
 *   → 🔧 web_search… (7s)
 *   → 🔧 read… (9s)
 *   → 📝 Writing… (12s)    ← preview takes over, edits same message
 *   → [actual response]     ← final
 *
 * Hybrid flow:
 *   1. Agent start   → send "🧠 Reasoning… (0s)", update every 5s
 *   2. Tool execution → update label to "🔧 toolName…"
 *   3. Generating     → update label to "📝 Writing…"
 *   4. Preview start  → inject messageId into preview state →
 *                       preview EDITS the same message (streaming)
 *   5. Agent end      → message IS the response — keep in place
 *   6. Fallback       → if no preview (error/abort), delete indicator
 */

const THINKING_INTERVAL_MS = 5000;

export interface TelegramThinkingIndicatorDeps {
  sendMessage: (
    chatId: number,
    text: string,
  ) => Promise<{ message_id: number } | undefined>;
  editMessageText: (
    chatId: number,
    messageId: number,
    text: string,
  ) => Promise<"edited" | "unchanged">;
  deleteMessage: (chatId: number, messageId: number) => Promise<boolean>;
}

export interface TelegramThinkingIndicatorState {
  messageId: number;
  chatId: number;
  startTime: number;
  interval?: ReturnType<typeof setInterval>;
  /** Current status label shown in the indicator. Updated live. */
  currentLabel: string;
  /** Resolves once the initial message has been sent. */
  ready: Promise<void>;
}

let INDICATOR_ENABLED = true;

export function setTelegramThinkingIndicatorEnabled(enabled: boolean): void {
  INDICATOR_ENABLED = enabled;
}

export function isTelegramThinkingIndicatorEnabled(): boolean {
  return INDICATOR_ENABLED;
}

/**
 * Send the initial thinking indicator message and start the
 * periodic elapsed-time update loop.
 */
export function startTelegramThinkingIndicator(
  chatId: number,
  deps: TelegramThinkingIndicatorDeps,
): TelegramThinkingIndicatorState | undefined {
  if (!INDICATOR_ENABLED) return undefined;
  const text = buildThinkingIndicatorText("Reasoning", 0);
  let resolveReady: () => void;
  const state: TelegramThinkingIndicatorState = {
    messageId: 0,
    chatId,
    startTime: Date.now(),
    currentLabel: "Reasoning",
    ready: new Promise((r) => {
      resolveReady = r;
    }),
  };
  deps.sendMessage(chatId, text).then((sent) => {
    if (!sent) {
      resolveReady!();
      return;
    }
    state.messageId = sent.message_id;
    state.interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      void deps.editMessageText(
        chatId,
        sent.message_id,
        buildThinkingIndicatorText(state.currentLabel, elapsed),
      );
    }, THINKING_INTERVAL_MS);
    resolveReady!();
  });
  return state;
}

/**
 * Update the indicator's status label and immediately edit the message.
 * E.g. from "Reasoning" → "🔧 web_search" → "📝 Writing"
 */
export function updateTelegramThinkingIndicatorLabel(
  state: TelegramThinkingIndicatorState | undefined,
  label: string,
  deps: TelegramThinkingIndicatorDeps,
): void {
  if (!state || !state.messageId) return;
  state.currentLabel = label;
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  void deps.editMessageText(
    state.chatId,
    state.messageId,
    buildThinkingIndicatorText(label, elapsed),
  );
}

/**
 * Stop the update interval and clean up.
 *
 * @param keepMessage  If true, leave the message (preview adopted it).
 */
export async function stopTelegramThinkingIndicator(
  state: TelegramThinkingIndicatorState | undefined,
  deps?: TelegramThinkingIndicatorDeps,
  keepMessage?: boolean,
): Promise<void> {
  if (!state) return;
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = undefined;
  }
  if (keepMessage) return; // preview adopted it — message IS the response
  if (deps && state.messageId) {
    try {
      await deps.deleteMessage(state.chatId, state.messageId);
    } catch {
      // best-effort
    }
  }
}

function buildThinkingIndicatorText(label: string, elapsedSeconds: number): string {
  const elapsed =
    elapsedSeconds < 60
      ? `${elapsedSeconds}s`
      : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  // Assign emoji by phase
  const emoji =
    label === "Reasoning"
      ? "🧠 "
      : label === "Writing"
        ? "📝 "
        : "🔧 ";
  return `${emoji}${label} (${elapsed})`;
}
