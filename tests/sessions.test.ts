/**
 * Regression tests for Telegram session control helpers
 * Exercises session-file discovery/preview, listing text, /resume resolution,
 * and the restart marker contract consumed by the bridge wrapper.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildTelegramSessionListText,
  buildTelegramSessionSwitchMarker,
  extractTelegramSessionPreview,
  formatTelegramSessionBytes,
  formatTelegramSessionStartedAt,
  listTelegramSessions,
  parseTelegramSessionFileName,
  resolveTelegramSessionChoice,
  type TelegramSessionEntry,
} from "../lib/sessions.ts";

const SESSION_A = "2026-11-06T22-55-16-291Z_01a1b312-cd43-7ef5-bb49-28f5b2535734.jsonl";
const SESSION_B = "2026-11-06T23-03-25-395Z_01a1b31a-43d3-7359-be3a-d244d785c587.jsonl";
const SESSION_C = "2026-11-07T01-10-00-000Z_abcd1234-1111-2222-3333-444455556666.jsonl";

function createEntry(fileName: string, extra: Partial<TelegramSessionEntry> = {}): TelegramSessionEntry {
  const parsed = parseTelegramSessionFileName(fileName);
  assert.ok(parsed);
  return {
    filePath: `/sessions/${fileName}`,
    fileName,
    id: parsed.id,
    startedAt: parsed.startedAt,
    mtimeMs: 0,
    bytes: 1536,
    ...extra,
  };
}

test("Session file names parse into id and start time", () => {
  const parsed = parseTelegramSessionFileName(SESSION_A);
  assert.ok(parsed);
  assert.equal(parsed.id, "01a1b312-cd43-7ef5-bb49-28f5b2535734");
  assert.equal(parsed.startedAt.toISOString(), "2026-11-06T22:55:16.291Z");
  assert.equal(parseTelegramSessionFileName("notes.jsonl"), undefined);
  assert.equal(
    parseTelegramSessionFileName("2026-11-06T22-55-16-291Z_not-a-uuid.jsonl"),
    undefined,
  );
});

test("Session listing sorts by activity and skips foreign files", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-tg-sessions-"));
  try {
    writeFileSync(join(dir, SESSION_A), "{}\n");
    writeFileSync(join(dir, SESSION_B), "{}\n");
    writeFileSync(join(dir, SESSION_C), "{}\n");
    writeFileSync(join(dir, "not-a-session.txt"), "ignore me");
    utimesSync(join(dir, SESSION_A), new Date(1000), new Date(1000));
    utimesSync(join(dir, SESSION_B), new Date(3000), new Date(3000));
    utimesSync(join(dir, SESSION_C), new Date(2000), new Date(2000));
    const entries = listTelegramSessions(dir);
    assert.deepEqual(
      entries.map((entry) => entry.fileName),
      [SESSION_B, SESSION_C, SESSION_A],
    );
    assert.equal(entries[0]?.bytes, 3);
    assert.deepEqual(listTelegramSessions(join(dir, "missing")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Session listing text shows order, size, current marker and preview", () => {
  const entries = [
    createEntry(SESSION_B, { mtimeMs: 3 }),
    createEntry(SESSION_C, { mtimeMs: 2 }),
  ];
  const text = buildTelegramSessionListText(entries, {
    currentFile: entries[0]?.filePath,
    readPreview: (filePath) =>
      filePath === entries[0]?.filePath ? "chào π" : undefined,
  });
  assert.match(text, /Sessions gần nhất \(2\)/);
  assert.match(text, /1\) .* · 1\.5 KB · 01a1b31a · \(đang dùng\)/);
  assert.match(text, /"chào π"/);
  assert.match(text, /2\) .*abcd1234/);
  assert.match(text, /\/resume <số\|id>/);
  assert.equal(
    buildTelegramSessionListText([]),
    "Chưa có session nào trong thư mục. Gõ /new để mở session mới.",
  );
});

test("Session preview comes from the first user message only", () => {
  const lines = [
    JSON.stringify({ type: "session", id: "x" }),
    JSON.stringify({
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    }),
    JSON.stringify({
      type: "message",
      message: {
        role: "user",
        content: [{ type: "text", text: "kiểm tra   cookie\nO365" }],
      },
    }),
  ];
  assert.equal(extractTelegramSessionPreview(lines), "kiểm tra cookie O365");
  assert.equal(extractTelegramSessionPreview(["not json"]), undefined);
  const long = JSON.stringify({
    type: "message",
    message: { role: "user", content: "x".repeat(120) },
  });
  const preview = extractTelegramSessionPreview([long]);
  assert.equal(preview?.length, 80);
  assert.ok(preview?.endsWith("..."));
});

test("Resume accepts list index or uuid prefix and rejects ambiguity", () => {
  const entries = [
    createEntry(SESSION_B),
    createEntry(SESSION_C),
    createEntry(SESSION_A, { id: "abcd9999-1111-2222-3333-444455556666" }),
  ];
  const byIndex = resolveTelegramSessionChoice(entries, "2");
  assert.equal(byIndex.kind === "found" ? byIndex.entry.fileName : "", SESSION_C);
  assert.equal(resolveTelegramSessionChoice(entries, "9").kind, "missing");
  const byPrefix = resolveTelegramSessionChoice(entries, "01a1b31a");
  assert.equal(
    byPrefix.kind === "found" ? byPrefix.entry.fileName : "",
    SESSION_B,
  );
  assert.equal(resolveTelegramSessionChoice(entries, "abc").kind, "invalid");
  assert.equal(resolveTelegramSessionChoice(entries, "abcd").kind, "invalid");
  assert.equal(resolveTelegramSessionChoice(entries, "ffff").kind, "missing");
  assert.equal(resolveTelegramSessionChoice(entries, "").kind, "invalid");
});

test("Session switch marker encodes the restart contract", () => {
  assert.equal(buildTelegramSessionSwitchMarker("new"), '{"mode":"new"}');
  assert.equal(
    buildTelegramSessionSwitchMarker("session", "/sessions/a.jsonl"),
    '{"mode":"session","session":"/sessions/a.jsonl"}',
  );
});

test("Session format helpers keep numbers readable", () => {
  assert.equal(formatTelegramSessionBytes(512), "512 B");
  assert.equal(formatTelegramSessionBytes(1536), "1.5 KB");
  assert.equal(formatTelegramSessionBytes(3 * 1024 * 1024), "3.0 MB");
  assert.match(
    formatTelegramSessionStartedAt(new Date("2026-11-06T22:55:16.291Z")),
    /^\d{2}:\d{2} \d{2}\/\d{2}$/,
  );
});
