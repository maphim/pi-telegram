# Analyze: 002-session-switch

**Ngày**: 2026-11-07 · **Kết quả**: PASS (còn 1 việc live chờ chủ)

## Traceability
| FR | Nơi cài | Test |
|---|---|---|
| FR-001 list + preview | `lib/sessions.ts` | `Session listing sorts…`, `…listing text shows…`, `preview comes from…` |
| FR-002 resume target | `resolveTelegramSessionChoice` | `Resume accepts list index or uuid prefix…` |
| FR-003 /new giữ lịch sử | wrapper marker `new` (bỏ `rm -rf`) | live-only (không unit-test được shell) |
| FR-004 idle guard | `commands.ts` handlers (`deps.isIdle`) | chưa có test routing-level (gap honest) |
| FR-005 marker contract | `buildTelegramSessionSwitchMarker` + wrapper | `Session switch marker encodes…` |
| FR-006 fallback `-c` | wrapper `case session` + `bash -n` | live-only |
| FR-007 menu + reserved | `TELEGRAM_BUILTIN_BOT_COMMANDS`, `TELEGRAM_RESERVED_COMMAND_NAMES` | `Session commands are reserved, immediate, and in the bot menu` |

## Số liệu
- `tests/sessions.test.ts`: 7/7 pass; sabotage 3/3 (sort/resolve/marker) đều bắt được.
- Full suite: **514 tests / 474 pass / 40 fail** (= baseline 40 fail, +8 test mới).
- typecheck: 89 lỗi pre-existing, **0 lỗi** ở `lib/sessions.ts`, `lib/commands.ts`, tests.

## Gap honest
1. Chưa có test routing-level chứng minh handler `/sessions|/resume|/new` được gọi từ message thật
   (bộ test command runtime đang fail pre-existing vì lệch kỳ vọng emoji/typing event).
2. Wrapper là shell ngoài repo → hành vi `--session` chỉ kiểm bằng live test.
3. `/new` + `/restart` dùng chung marker `new`; khác biệt chỉ ở phần thông điệp.
