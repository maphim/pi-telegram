/**
 * Thinking indicator — edit-in-place status message during LLM reasoning
 * Zones: telegram ui, progress indication, reasoning feedback
 * Owns sending, updating, and cleaning up a "🧠 Processing…" message
 * that shows elapsed time while the LLM is thinking.
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

/**
 * Send the initial "🧠 Processing…" thinking indicator and start
 * the periodic elapsed-time update loop.
 */
export function startTelegramThinkingIndicator(
  chatId: number,
  deps: TelegramThinkingIndicatorDeps,
): TelegramThinkingIndicatorState | undefined {
  const text = buildThinkingIndicatorText(0);
  // Fire-and-forget send — returns a controller that wraps the eventual messageId
  const state: TelegramThinkingIndicatorState = {
    messageId: 0,
    chatId,
    startTime: Date.now(),
  };
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
 * Call when the actual response is about to appear.
 */
export async function stopTelegramThinkingIndicator(
  state: TelegramThinkingIndicatorState | undefined,
  finalText?: string,
  deps?: TelegramThinkingIndicatorDeps,
): Promise<void> {
  if (!state) return;
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = undefined;
  }
  // If we have a final text and deps, edit the thinking message with the result
  if (finalText && deps && state.messageId) {
    try {
      await deps.editMessageText(state.chatId, state.messageId, finalText);
      return; // successfully replaced
    } catch {
      // fall through to delete
    }
  }
  // Otherwise delete the indicator
  if (deps && state.messageId) {
    try {
      await deps.deleteMessage(state.chatId, state.messageId);
    } catch {
      // best-effort cleanup
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
