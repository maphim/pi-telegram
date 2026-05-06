/**
 * Thinking indicator — edit-in-place status message during LLM reasoning
 * Zones: telegram ui, progress indication, reasoning feedback
 * Owns sending, updating, and cleaning up a "🧠 Processing…" message
 * that shows elapsed time while the LLM is thinking.
 *
 * Hybrid flow:
 *   1. Agent start   → send "🧠 Processing… (0s)", update every 5s
 *   2. LLM reasoning → elapsed timer keeps running
 *   3. Preview start → inject thinking messageId into preview state →
 *                      preview EDITS the same message instead of sending new
 *   4. Agent end     → thinking message IS the response — no delete needed
 *   5. Fallback      → if no preview, delete indicator
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
  /** Resolves once the initial message has been sent and messageId is set. */
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
 * Send the initial "🧠 Processing…" thinking indicator and start
 * the periodic elapsed-time update loop.
 *
 * The returned state includes a `.ready` promise that resolves once
 * the message has been sent and `messageId` is populated. The preview
 * system can await `.ready` and then use `messageId` as its target.
 */
export function startTelegramThinkingIndicator(
  chatId: number,
  deps: TelegramThinkingIndicatorDeps,
): TelegramThinkingIndicatorState | undefined {
  if (!INDICATOR_ENABLED) return undefined;
  const text = buildThinkingIndicatorText(0);
  let resolveReady: () => void;
  const state: TelegramThinkingIndicatorState = {
    messageId: 0,
    chatId,
    startTime: Date.now(),
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
        buildThinkingIndicatorText(elapsed),
      );
    }, THINKING_INTERVAL_MS);
    resolveReady!();
  });
  return state;
}

/**
 * Stop the update interval and clean up the thinking indicator.
 *
 * @param keepMessage  If true, leave the message in place (it was adopted
 *                     by the preview/outbound system as the response).
 *                     Default: false (delete the indicator).
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

/**
 * Build the thinking indicator text with elapsed seconds.
 */
function buildThinkingIndicatorText(elapsedSeconds: number): string {
  const elapsed =
    elapsedSeconds < 60
      ? `${elapsedSeconds}s`
      : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
  return `🧠 Processing… (${elapsed})`;
}
