/**
 * Thinking indicator — edit-in-place status message during LLM reasoning
 * Zones: telegram ui, progress indication, reasoning feedback
 * Owns sending, updating, and cleaning up a "🧠 Processing…" message
 * that shows elapsed time while the LLM is thinking.
 *
 * Flow:
 *   Agent start → send "🧠 Processing… (0s)", update every 5s
 *   Agent end   → delete the indicator (response delivered through normal channels)
 *   Preview start → delete the indicator (preview takes over)
 *   Error       → delete the indicator
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
}

let INDICATOR_ENABLED = true;

/** Enable or disable the thinking indicator globally. */
export function setTelegramThinkingIndicatorEnabled(enabled: boolean): void {
  INDICATOR_ENABLED = enabled;
}

export function isTelegramThinkingIndicatorEnabled(): boolean {
  return INDICATOR_ENABLED;
}

/**
 * Send the initial "🧠 Processing…" thinking indicator and start
 * the periodic elapsed-time update loop. Returns a state object
 * that must be passed to stopTelegramThinkingIndicator for cleanup.
 */
export function startTelegramThinkingIndicator(
  chatId: number,
  deps: TelegramThinkingIndicatorDeps,
): TelegramThinkingIndicatorState | undefined {
  if (!INDICATOR_ENABLED) return undefined;
  const text = buildThinkingIndicatorText(0);
  const state: TelegramThinkingIndicatorState = {
    messageId: 0,
    chatId,
    startTime: Date.now(),
  };
  // Fire-and-forget — the promise resolves asynchronously
  deps.sendMessage(chatId, text).then((sent) => {
    if (!sent) return;
    state.messageId = sent.message_id;
    state.interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      void deps.editMessageText(
        chatId,
        sent.message_id,
        buildThinkingIndicatorText(elapsed),
      );
    }, THINKING_INTERVAL_MS);
  });
  return state;
}

/**
 * Stop the update interval and delete the thinking indicator message.
 * Safe to call multiple times. The actual response is delivered
 * through the normal preview/outbound channels.
 */
export async function stopTelegramThinkingIndicator(
  state: TelegramThinkingIndicatorState | undefined,
  deps?: TelegramThinkingIndicatorDeps,
): Promise<void> {
  if (!state) return;
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = undefined;
  }
  // Delete the indicator message (best-effort)
  if (deps && state.messageId) {
    try {
      await deps.deleteMessage(state.chatId, state.messageId);
    } catch {
      // best-effort — message may already be deleted
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
