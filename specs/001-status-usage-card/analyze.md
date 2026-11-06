# Analyze: 001-status-usage-card

**Ngày**: 2026-11-07 · **Kết quả**: PASS (không còn việc chặn)

## Traceability Spec → Plan → Tasks → Test

| FR | Plan | Task | Test chứng minh |
|---|---|---|---|
| FR-001 Model row | `buildStatusHtml` row Model | 1.2 | `Status HTML builder binds active model lookup` (regex `Model.*openai/gpt-5`) |
| FR-002 Context tokens/%/window | `buildContextSummary` + `formatTokenCount` | 1.3 | `Status HTML shows the opencode-style model usage card` (`140,398 tokens (13.4% used of 1.0M)`) |
| FR-003 Cost 4dp + spent + (sub) | `buildCostSummary` | 1.4 | card test (`$0.0438 spent`) + `marks subscription models` (`$0.0000 spent (sub)`) |
| FR-004 Honesty ?, unknown | nhánh null/undefined | 1.3 | test bind model (`? tokens`) + subscription test (`Context unknown`) |
| FR-005 Không đổi row khác | giữ nguyên Status/Usage | — | toàn bộ test cũ của status pass, full suite 463/40 = baseline, +2 test mới |
| FR-006 Không API ngoài | dùng `getContextUsage()` + `sessionManager` | — | không thêm import/io trong diff |

## Kiểm chứng chất lượng test (sabotage)

| Sabotage | Kết quả mong đợi | Thực tế |
|---|---|---|
| Bỏ dấu phẩy ngăn nghìn | card test FAIL | FAIL 1/15 ✓ |
| Bỏ row Model | 2 test FAIL | FAIL 2/15 ✓ |
| Cost về 3dp (mất "spent") | 2 test FAIL | FAIL 2/15 ✓ |

Khôi phục → 15/15 pass. Không có test nào "pass-ảo" (mỗi hành vi đều có sabotage tương ứng).

## Số liệu check

- `npx tsc --noEmit`: 89 lỗi — **bằng baseline**, 0 lỗi ở `lib/status.ts` / `index.ts` / `tests/status.test.ts`.
- `npm test`: 503 tests, **463 pass** (+2), 40 fail pre-existing (không đổi danh sách).
- `invariants.test.ts`: pass (index.ts không `=>`, header/Zone tags, DAG không chu trình).

## Quyết định phát sinh

1. `TelegramContextUsage.tokens` để optional — π truyền `tokens: number | null`; `null` (ngay sau compact) hiển thị `?` thay vì số 0 giả.
2. `TelegramStatusActiveModel` thêm `provider/id` optional — model undefined (session chưa chọn) thì bỏ row Model, không in `undefined`.
3. US2 (menu /model chi tiết) giữ out-of-scope — cần plumb usage qua `buildState` ctx tối thiểu, làm spec riêng khi chủ yêu cầu.

## Appendix (2026-11-07): menu đăng ký lệnh — FR-007

Chủ phát hiện sau khi ship: `/status` chạy được nhưng không có trong menu `/` của bot
(`setMyCommands` chỉ đăng ký start/compact/next/continue/abort/stop/restart).

- Thêm `status, model, thinking, queue, help` vào `TELEGRAM_BUILTIN_BOT_COMMANDS`.
- Test mới `Bot command menu exposes the bridge-served commands`; sabotage bỏ `status`
  → FAIL (8 fail), khôi phục 19 pass / 7 fail pre-existing.
- Full suite: **464 pass / 40 fail** (504 tests, +1 test mới, danh sách fail pre-existing không đổi).
- Lưu ý: test `Command helpers expose Telegram bot command definitions` vẫn nằm trong nhóm
  fail pre-existing (source đã chuyển emoji ASCII, test chưa cập nhật) — ngoài phạm vi spec này.
