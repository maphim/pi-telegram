/**
 * Regression tests for Telegram model control helpers
 * Exercises model selection state/resolution plus in-flight model-switch orchestration
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildTelegramModelSwitchContinuationText,
  buildTelegramModelSwitchContinuationTurn,
  canRestartTelegramTurnForModelSwitch,
  createActiveModelPersistenceRuntime,
  createCurrentModelRuntime,
  createCurrentModelStore,
  createCurrentModelUpdateRuntime,
  createPendingModelSwitchStore,
  createTelegramModelFallbackRuntime,
  createTelegramModelSwitchContinuationQueue,
  createTelegramModelSwitchContinuationQueueRuntime,
  createTelegramModelSwitchContinuationTurnBuilder,
  createTelegramModelSwitchController,
  createTelegramModelSwitchControllerRuntime,
  getCanonicalModelId,
  isProviderServerModelError,
  isThinkingLevel,
  type MenuModel,
  modelsMatch,
  parseTelegramCliScopedModelPatterns,
  parseTelegramScopedModelPatternList,
  readActiveModel,
  resolveScopedModelPatterns,
  restartTelegramModelSwitchContinuation,
  saveActiveModel,
  shouldTriggerPendingTelegramModelSwitchAbort,
  sortScopedModels,
  THINKING_LEVELS,
} from "../lib/model.ts";
import type { PendingTelegramTurn } from "../lib/queue.ts";

function createModelTestModel(
  provider = "openai",
  id = "gpt-5",
  extra: Partial<MenuModel> = {},
): MenuModel {
  return { provider, id, ...extra };
}

function createModelTestSelection(
  model = createModelTestModel(),
  thinkingLevel?: "high",
): { model: MenuModel; thinkingLevel?: "high" } {
  return thinkingLevel === undefined ? { model } : { model, thinkingLevel };
}

function createModelTestTurn(
  overrides: Partial<PendingTelegramTurn> = {},
): PendingTelegramTurn {
  return {
    kind: "prompt",
    chatId: 7,
    replyToMessageId: 8,
    sourceMessageIds: [8],
    queueOrder: 0,
    queueLane: "default",
    laneOrder: 0,
    queuedAttachments: [],
    content: [],
    historyText: "active",
    statusSummary: "active",
    ...overrides,
  };
}

test("Current model store prefers explicit Telegram model over context fallback", () => {
  const fallback = { provider: "fallback", id: "f", name: "Fallback" };
  const selected = { provider: "selected", id: "s", name: "Selected" };
  const store = createCurrentModelStore<
    { model?: typeof fallback },
    typeof fallback
  >((ctx) => ctx.model);
  assert.equal(store.get({ model: fallback }), fallback);
  assert.equal(store.getStored(), undefined);
  store.set(selected);
  assert.equal(store.get({ model: fallback }), selected);
  assert.equal(store.getStored(), selected);
  store.set(undefined);
  assert.equal(store.get({ model: fallback }), fallback);
});

test("Current model runtime combines store fallback and status updates", () => {
  const fallback = { provider: "fallback", id: "f", name: "Fallback" };
  const selected = { provider: "selected", id: "s", name: "Selected" };
  const statuses: string[] = [];
  const runtime = createCurrentModelRuntime<
    { id: string; model?: typeof fallback },
    typeof fallback
  >({
    getContextModel: (ctx) => ctx.model,
    updateStatus: (ctx) => {
      statuses.push(ctx.id);
    },
  });
  assert.equal(runtime.get({ id: "fallback", model: fallback }), fallback);
  runtime.setCurrentModel(selected, { id: "direct" });
  assert.equal(runtime.get({ id: "fallback", model: fallback }), selected);
  runtime.onModelSelect({ model: undefined }, { id: "event" });
  assert.equal(runtime.get({ id: "fallback", model: fallback }), fallback);
  assert.deepEqual(statuses, ["direct", "event"]);
});

test("Current model update runtime stores selections and refreshes status", () => {
  const selected = { provider: "selected", id: "s", name: "Selected" };
  let stored: typeof selected | undefined;
  const statuses: string[] = [];
  const runtime = createCurrentModelUpdateRuntime<
    { id: string },
    typeof selected
  >({
    setCurrentModel: (model) => {
      stored = model;
    },
    updateStatus: (ctx) => {
      statuses.push(ctx.id);
    },
  });
  runtime.setCurrentModel(selected, { id: "direct" });
  assert.equal(stored, selected);
  runtime.onModelSelect({ model: selected }, { id: "event" });
  assert.deepEqual(statuses, ["direct", "event"]);
});

test("Model helpers match models, detect thinking levels, and expose constants", () => {
  assert.deepEqual(THINKING_LEVELS, [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  assert.equal(
    modelsMatch(createModelTestModel(), createModelTestModel()),
    true,
  );
  assert.equal(
    modelsMatch(
      createModelTestModel(),
      createModelTestModel("anthropic", "gpt-5"),
    ),
    false,
  );
  assert.equal(getCanonicalModelId(createModelTestModel()), "openai/gpt-5");
  assert.equal(isThinkingLevel("high"), true);
  assert.equal(isThinkingLevel("impossible"), false);
});

test("Model helpers parse scoped model pattern lists and CLI flags", () => {
  assert.deepEqual(parseTelegramScopedModelPatternList("a, b:high, "), [
    "a",
    "b:high",
  ]);
  assert.deepEqual(
    parseTelegramCliScopedModelPatterns(["--models", "a,b:high"]),
    ["a", "b:high"],
  );
  assert.deepEqual(parseTelegramCliScopedModelPatterns(["--models=a, b "]), [
    "a",
    "b",
  ]);
  assert.equal(
    parseTelegramCliScopedModelPatterns(["--models", "  "]),
    undefined,
  );
  assert.equal(
    parseTelegramCliScopedModelPatterns(["--other", "a"]),
    undefined,
  );
});

test("Model helpers resolve scoped model patterns and sort current models first", () => {
  const models: MenuModel[] = [
    createModelTestModel("openai", "gpt-5", { name: "GPT 5" }),
    createModelTestModel("openai", "gpt-5-latest", { name: "GPT 5 Latest" }),
    createModelTestModel("anthropic", "claude-sonnet-20250101", {
      name: "Claude Sonnet",
    }),
  ];
  const resolved = resolveScopedModelPatterns(
    ["gpt-5:high", "anthropic/*:low"],
    models,
  );
  assert.deepEqual(
    resolved.map((entry) => ({
      id: entry.model.id,
      thinking: entry.thinkingLevel,
    })),
    [
      { id: "gpt-5", thinking: "high" },
      { id: "claude-sonnet-20250101", thinking: "low" },
    ],
  );
  const sorted = sortScopedModels(resolved, models[0]);
  assert.equal(sorted[0]?.model.id, "gpt-5");
});

test("Pending model-switch store owns selection state helpers", () => {
  const store = createPendingModelSwitchStore<{ id: string }>();
  assert.equal(store.has(), false);
  assert.equal(store.get(), undefined);
  store.set({ id: "next" });
  assert.equal(store.has(), true);
  assert.deepEqual(store.get(), { id: "next" });
  store.clear();
  assert.equal(store.has(), false);
});

test("In-flight model switch is allowed only for active Telegram turns with abort support", () => {
  assert.equal(
    canRestartTelegramTurnForModelSwitch({
      isIdle: false,
      hasActiveTelegramTurn: true,
      hasAbortHandler: true,
    }),
    true,
  );
  assert.equal(
    canRestartTelegramTurnForModelSwitch({
      isIdle: true,
      hasActiveTelegramTurn: true,
      hasAbortHandler: true,
    }),
    false,
  );
  assert.equal(
    canRestartTelegramTurnForModelSwitch({
      isIdle: false,
      hasActiveTelegramTurn: false,
      hasAbortHandler: true,
    }),
    false,
  );
  assert.equal(
    canRestartTelegramTurnForModelSwitch({
      isIdle: false,
      hasActiveTelegramTurn: true,
      hasAbortHandler: false,
    }),
    false,
  );
});

test("Pending model switch abort waits until no tool executions remain", () => {
  assert.equal(
    shouldTriggerPendingTelegramModelSwitchAbort({
      hasPendingModelSwitch: true,
      hasActiveTelegramTurn: true,
      hasAbortHandler: true,
      activeToolExecutions: 0,
    }),
    true,
  );
  assert.equal(
    shouldTriggerPendingTelegramModelSwitchAbort({
      hasPendingModelSwitch: true,
      hasActiveTelegramTurn: true,
      hasAbortHandler: true,
      activeToolExecutions: 1,
    }),
    false,
  );
  assert.equal(
    shouldTriggerPendingTelegramModelSwitchAbort({
      hasPendingModelSwitch: false,
      hasActiveTelegramTurn: true,
      hasAbortHandler: true,
      activeToolExecutions: 0,
    }),
    false,
  );
});

test("Model-switch continuation restart queues before abort when state is present", () => {
  const events: string[] = [];
  assert.equal(
    restartTelegramModelSwitchContinuation({
      activeTurn: { id: 1 },
      abort: () => {
        events.push("abort");
      },
      selection: createModelTestSelection(),
      queueContinuation: (turn, selection) => {
        events.push(`queue:${turn.id}:${selection.model.id}`);
      },
    }),
    true,
  );
  assert.deepEqual(events, ["queue:1:gpt-5", "abort"]);
  assert.equal(
    restartTelegramModelSwitchContinuation({
      activeTurn: undefined,
      abort: () => {},
      selection: createModelTestSelection(),
      queueContinuation: () => {
        events.push("unexpected");
      },
    }),
    false,
  );
});

test("Model-switch controller centralizes pending abort and continuation queueing", () => {
  const events: string[] = [];
  let pendingSelection: { model: { provider: string; id: string } } | undefined;
  const activeTurn = createModelTestTurn({
    chatId: 1,
    replyToMessageId: 2,
    sourceMessageIds: [2],
    queueOrder: 3,
    laneOrder: 3,
    historyText: "previous",
    statusSummary: "previous",
  });
  const controller = createTelegramModelSwitchController({
    isIdle: () => false,
    getPendingModelSwitch: () => pendingSelection,
    setPendingModelSwitch: (selection) => {
      pendingSelection = selection;
    },
    getActiveTurn: () => activeTurn,
    getAbortHandler: () => {
      return () => {
        events.push("abort");
      };
    },
    hasAbortHandler: () => true,
    getActiveToolExecutions: () => 0,
    queueContinuation: (turn, selection) => {
      events.push(`queue:${turn.replyToMessageId}:${selection.model.id}`);
    },
    updateStatus: () => {
      events.push("status");
    },
  });
  assert.equal(controller.canOfferInFlightSwitch({}), true);
  controller.stagePendingSwitch(createModelTestSelection(), {});
  assert.deepEqual(events, ["status"]);
  assert.equal(controller.triggerPendingAbort({}), true);
  assert.deepEqual(events, ["status", "queue:2:gpt-5", "abort"]);
  assert.equal(pendingSelection, undefined);
});

test("Model-switch controller runtime binds continuation queue construction", () => {
  const appended: PendingTelegramTurn[] = [];
  let pending: { model: { provider: string; id: string } } | undefined =
    createModelTestSelection();
  let aborted = false;
  const activeTurn = createModelTestTurn();
  const controller = createTelegramModelSwitchControllerRuntime({
    isIdle: () => false,
    getPendingModelSwitch: () => pending,
    setPendingModelSwitch: (selection) => {
      pending = selection;
    },
    getActiveTurn: () => activeTurn,
    getAbortHandler: () => {
      return () => {
        aborted = true;
      };
    },
    hasAbortHandler: () => true,
    getActiveToolExecutions: () => 0,
    telegramPrefix: "[telegram]",
    allocateItemOrder: () => 5,
    allocateControlOrder: () => 6,
    appendQueuedItem: (item) => {
      appended.push(item);
    },
    updateStatus: () => {},
  });
  assert.equal(controller.triggerPendingAbort(undefined), true);
  assert.equal(aborted, true);
  assert.equal(pending, undefined);
  assert.equal(appended[0]?.queueOrder, 5);
  assert.equal(appended[0]?.queueLane, "control");
});

test("Model-switch continuation turn stays control-lane and resume-oriented", () => {
  const createContinuationTurn =
    createTelegramModelSwitchContinuationTurnBuilder({
      allocateItemOrder: () => 5,
      allocateControlOrder: () => 6,
    });
  const builtTurn = createContinuationTurn({
    turn: { chatId: 1, replyToMessageId: 2 },
    selection: createModelTestSelection(),
  });
  assert.equal(builtTurn.queueOrder, 5);
  assert.equal(builtTurn.laneOrder, 6);
  const turn = buildTelegramModelSwitchContinuationTurn({
    turn: { chatId: 1, replyToMessageId: 2 },
    selection: createModelTestSelection(createModelTestModel(), "high"),
    telegramPrefix: "[telegram]",
    queueOrder: 3,
    laneOrder: 4,
  });
  assert.equal(turn.kind, "prompt");
  assert.equal(turn.queueLane, "control");
  assert.equal(turn.queueOrder, 3);
  assert.equal(turn.laneOrder, 4);
  assert.equal(turn.chatId, 1);
  assert.equal(turn.replyToMessageId, 2);
  assert.deepEqual(turn.sourceMessageIds, []);
  assert.equal(
    turn.historyText,
    "Continue interrupted Telegram request on openai/gpt-5",
  );
  assert.equal(turn.statusSummary, "↻ continue on gpt-5");
  assert.match(String(turn.content[0]?.type), /text/);
  assert.match(
    String((turn.content[0] as { text?: string } | undefined)?.text ?? ""),
    /Continue the interrupted previous Telegram request/,
  );
});

test("Model-switch continuation queue runtime builds and appends control-lane turns", () => {
  const appended: PendingTelegramTurn[] = [];
  const queueContinuation = createTelegramModelSwitchContinuationQueueRuntime({
    allocateItemOrder: () => 3,
    allocateControlOrder: () => 4,
    appendQueuedItem: (item) => {
      appended.push(item);
    },
  });
  queueContinuation(
    createModelTestTurn(),
    createModelTestSelection(),
    undefined,
  );
  assert.equal(appended[0]?.queueOrder, 3);
  assert.equal(appended[0]?.laneOrder, 4);
  assert.equal(appended[0]?.queueLane, "control");
  assert.match(
    String((appended[0]?.content[0] as { text?: string } | undefined)?.text),
    /^\[telegram\] Continue/,
  );
});

test("Model-switch continuation queue creates and appends continuation turns", () => {
  const appended: Array<{ item: PendingTelegramTurn; ctx: { id: string } }> =
    [];
  const queueContinuation = createTelegramModelSwitchContinuationQueue({
    createContinuationTurn: ({ turn, selection }) => ({
      ...turn,
      kind: "prompt" as const,
      queueOrder: 1,
      queueLane: "control" as const,
      laneOrder: 2,
      sourceMessageIds: [],
      queuedAttachments: [],
      content: [{ type: "text" as const, text: selection.model.id }],
      historyText: "continue",
      statusSummary: "continue",
    }),
    appendQueuedItem: (item, ctx: { id: string }) => {
      appended.push({ item, ctx });
    },
  });
  queueContinuation(createModelTestTurn(), createModelTestSelection(), {
    id: "ctx",
  });
  assert.equal(appended[0]?.item.content[0]?.type, "text");
  assert.equal(appended[0]?.item.content[0]?.text, "gpt-5");
  assert.deepEqual(appended[0]?.ctx, { id: "ctx" });
});

test("Continuation prompt stays Telegram-scoped and resume-oriented", () => {
  const text = buildTelegramModelSwitchContinuationText(
    "[telegram]",
    createModelTestModel(),
    "high",
  );
  assert.match(text, /^\[telegram\]/);
  assert.match(text, /Continue the interrupted previous Telegram request/);
  assert.match(text, /openai\/gpt-5/);
  assert.match(text, /thinking level \(high\)/);
});

// --- Active model persistence (survives /restart + /new) ---

test("saveActiveModel/readActiveModel roundtrip tolerates missing and corrupt files", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-active-model-"));
  const path = join(dir, "active.json");
  try {
    assert.equal(readActiveModel(path), undefined); // missing file
    saveActiveModel({ provider: "amd", id: "MiMo-V2.6-Flash" }, path);
    assert.deepEqual(readActiveModel(path), {
      provider: "amd",
      id: "MiMo-V2.6-Flash",
    });
    writeFileSync(path, "{corrupt", "utf8");
    assert.equal(readActiveModel(path), undefined); // corrupt → undefined
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persistence restore re-applies a differing saved model exactly once", async () => {
  const target: MenuModel = { provider: "amd", id: "MiMo-V2.6-Flash" };
  let live: MenuModel = { provider: "nvidia", id: "z-ai/glm-5.3" };
  const setCalls: MenuModel[] = [];
  const ctx = {
    modelRegistry: {
      refresh: () => {},
      getAvailable: () => [target],
    },
  };
  const runtime = createActiveModelPersistenceRuntime({
    getContextModel: () => live,
    setModel: async (m) => {
      setCalls.push(m);
      live = m;
      return true;
    },
    readSavedModel: () => ({ provider: "amd", id: "MiMo-V2.6-Flash" }),
    saveSavedModel: () => {},
  });
  await runtime.onSessionStart({}, ctx);
  assert.deepEqual(setCalls, [target]); // dead session model → persisted one
  await runtime.onSessionStart({}, ctx); // next session_start: already on saved
  assert.equal(setCalls.length, 1);
});

test("persistence restore keeps the current model when the saved one is gone", async () => {
  const live: MenuModel = { provider: "amd", id: "MiMo-V2.6-Flash" };
  let setCalls = 0;
  const ctx = {
    modelRegistry: {
      refresh: () => {},
      getAvailable: () => [] as MenuModel[],
    },
  };
  const runtime = createActiveModelPersistenceRuntime({
    getContextModel: () => live,
    setModel: async () => {
      setCalls += 1;
      return true;
    },
    readSavedModel: () => ({ provider: "kimi", id: "kimi-k2.6" }),
    saveSavedModel: () => {},
  });
  await runtime.onSessionStart({}, ctx);
  assert.equal(setCalls, 0);
});

test("persistence persist is gated until the first restore (boot window)", async () => {
  const saved: Array<Pick<MenuModel, "provider" | "id">> = [];
  const ctx = {
    modelRegistry: {
      refresh: () => {},
      getAvailable: () => [] as MenuModel[],
    },
  };
  const runtime = createActiveModelPersistenceRuntime({
    getContextModel: () => undefined,
    setModel: async () => true,
    readSavedModel: () => ({ provider: "amd", id: "MiMo-V2.6-Flash" }),
    saveSavedModel: (m) => {
      saved.push(m);
    },
  });
  runtime.persist({ provider: "nvidia", id: "z-ai/glm-5.3" }); // session-init event
  assert.equal(saved.length, 0); // must not clobber the persisted model
  await runtime.onSessionStart({}, ctx);
  runtime.persist({ provider: "amd", id: "Qwen3.8-27B" }); // genuine selection
  assert.deepEqual(saved, [{ provider: "amd", id: "Qwen3.8-27B" }]);
});

test("Provider error classifier separates provider failures from user/context errors", () => {
  assert.equal(isProviderServerModelError("410 status code (no body)"), true);
  assert.equal(isProviderServerModelError("502 status code (Bad Gateway)"), true);
  assert.equal(isProviderServerModelError("503 status code"), true);
  assert.equal(isProviderServerModelError("fetch failed"), true);
  assert.equal(isProviderServerModelError("request timed out"), true);
  assert.equal(isProviderServerModelError("The turn was aborted by user"), false);
  // Payload-too-large is a session-size problem: switching model would not shrink
  // the request body, so the classifier must not trigger a fallback switch.
  assert.equal(
    isProviderServerModelError(
      '413 <html><head><title>413 Request Entity Too Large</title></head></html>',
    ),
    false,
  );
  assert.equal(isProviderServerModelError("413 status code (Request Entity Too Large)"), false);
  assert.equal(isProviderServerModelError("context window exceeded"), false);
  assert.equal(isProviderServerModelError("unexpected internal bug"), false);
  assert.equal(isProviderServerModelError(""), false);
});

test("Model fallback switches to the next enabled model and reports it", async () => {
  const active = createModelTestModel("amd", "DeepSeek-V4.1-Flash");
  const next = createModelTestModel("nvidia", "z-ai/glm-5.3-flash");
  const switched: string[] = [];
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "amd/DeepSeek-V4.1-Flash",
        "nvidia/z-ai/glm-5.3-flash",
      ],
    }),
    setModel: async (model) => {
      switched.push(`set:${getCanonicalModelId(model)}`);
      return true;
    },
    setCurrentModel: (model) => {
      switched.push(`current:${getCanonicalModelId(model)}`);
    },
  });
  const note = await runtime("502 status code", {
    cwd: "/tmp",
    modelRegistry: { refresh: () => {}, getAvailable: () => [active, next] },
  });
  assert.match(note ?? "", /nvidia\/z-ai\/glm-5\.3-flash/);
  assert.deepEqual(switched, [
    "set:nvidia/z-ai/glm-5.3-flash",
    "current:nvidia/z-ai/glm-5.3-flash",
  ]);
});

test("Model fallback leaves the model alone for non-provider errors", async () => {
  const active = createModelTestModel("amd", "DeepSeek-V4.1-Flash");
  let switches = 0;
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "amd/DeepSeek-V4.1-Flash",
        "nvidia/z-ai/glm-5.3-flash",
      ],
    }),
    setModel: async () => {
      switches += 1;
      return true;
    },
    setCurrentModel: () => {},
  });
  const ctx = {
    cwd: "/tmp",
    modelRegistry: {
      refresh: () => {},
      getAvailable: () =>
        [active, createModelTestModel("nvidia", "z-ai/glm-5.3-flash")],
    },
  };
  assert.equal(await runtime("user aborted the turn", ctx), undefined);
  assert.equal(await runtime("context window exceeded", ctx), undefined);
  assert.equal(switches, 0);
});

test("Model fallback prefers a same-family host on another provider first", async () => {
  const active = createModelTestModel("deepseek", "deepseek-flash");
  const mimo = createModelTestModel("amd", "MiMo-V2.6-Flash");
  const amdDeepseek = createModelTestModel("amd", "DeepSeek-V4.1-Flash");
  const nvidiaDeepseek = createModelTestModel(
    "nvidia",
    "deepseek-ai/deepseek-v4.1-flash",
  );
  const switched: string[] = [];
  const activated: string[] = [];
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "deepseek/deepseek-flash",
        "amd/MiMo-V2.6-Flash",
        "amd/DeepSeek-V4.1-Flash",
        "nvidia/deepseek-ai/deepseek-v4.1-flash",
      ],
    }),
    setModel: async (model) => {
      switched.push(getCanonicalModelId(model));
      return true;
    },
    setCurrentModel: (model) => {
      activated.push(getCanonicalModelId(model));
    },
  });
  const note = await runtime("Stream ended without finish_reason", {
    cwd: "/tmp",
    modelRegistry: {
      refresh: () => {},
      getAvailable: () => [active, mimo, amdDeepseek, nvidiaDeepseek],
    },
  });
  // MiMo comes first in enabledModels, but the DeepSeek family wins because the
  // active model is DeepSeek: stay on the same family on a healthy host.
  assert.deepEqual(switched, ["amd/DeepSeek-V4.1-Flash"]);
  // The active-model state must follow the switch, otherwise /model would still
  // show the dead model as active.
  assert.deepEqual(activated, ["amd/DeepSeek-V4.1-Flash"]);
  assert.match(note ?? "", /amd\/DeepSeek-V4\.1-Flash/);
});

test("Model fallback keeps enabledModels order when the family has no other host", async () => {
  const active = createModelTestModel("deepseek", "deepseek-flash");
  const groq = createModelTestModel("groq", "openai/gpt-oss-120b");
  const ovh = createModelTestModel("ovh", "gpt-oss-120b");
  const switched: string[] = [];
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "deepseek/deepseek-flash",
        "groq/openai/gpt-oss-120b",
        "ovh/gpt-oss-120b",
      ],
    }),
    setModel: async (model) => {
      switched.push(getCanonicalModelId(model));
      return true;
    },
    setCurrentModel: () => {},
  });
  await runtime("503 status code", {
    cwd: "/tmp",
    modelRegistry: { refresh: () => {}, getAvailable: () => [active, groq, ovh] },
  });
  assert.deepEqual(switched, ["groq/openai/gpt-oss-120b"]);
});

test("Model fallback skips models pi refuses and stops when nothing is left", async () => {
  const active = createModelTestModel("amd", "DeepSeek-V4.1-Flash");
  const middle = createModelTestModel("nvidia", "z-ai/glm-5.3-flash");
  const last = createModelTestModel("deepseek", "deepseek-v4-pro");
  const attempted: string[] = [];
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "amd/DeepSeek-V4.1-Flash",
        "nvidia/z-ai/glm-5.3-flash",
        "deepseek/deepseek-v4-pro",
      ],
    }),
    setModel: async (model) => {
      attempted.push(getCanonicalModelId(model));
      // pi refuses the same-family host, so the fallback must keep walking.
      return getCanonicalModelId(model) === "nvidia/z-ai/glm-5.3-flash";
    },
    setCurrentModel: () => {},
  });
  const note = await runtime("503 status code", {
    cwd: "/tmp",
    modelRegistry: {
      refresh: () => {},
      getAvailable: () => [active, middle, last],
    },
  });
  // Same-family host on another provider is tried first (deepseek-v4-pro),
  // pi refuses it, then the fallback continues with the next model in order.
  assert.deepEqual(attempted, [
    "deepseek/deepseek-v4-pro",
    "nvidia/z-ai/glm-5.3-flash",
  ]);
  assert.match(note ?? "", /nvidia\/z-ai\/glm-5\.3-flash/);
});

test("Model fallback wraps around the enabled order", async () => {
  const active = createModelTestModel("deepseek", "deepseek-v4-pro");
  const first = createModelTestModel("amd", "DeepSeek-V4.1-Flash");
  const switched: string[] = [];
  const runtime = createTelegramModelFallbackRuntime<MenuModel>({
    getActiveModel: () => active,
    createSettingsManager: () => ({
      getEnabledModels: () => [
        "amd/DeepSeek-V4.1-Flash",
        "deepseek/deepseek-v4-pro",
      ],
    }),
    setModel: async (model) => {
      switched.push(getCanonicalModelId(model));
      return true;
    },
    setCurrentModel: () => {},
  });
  const note = await runtime("410 status code", {
    cwd: "/tmp",
    modelRegistry: { refresh: () => {}, getAvailable: () => [first, active] },
  });
  assert.deepEqual(switched, ["amd/DeepSeek-V4.1-Flash"]);
  assert.match(note ?? "", /amd\/DeepSeek-V4\.1-Flash/);
});
