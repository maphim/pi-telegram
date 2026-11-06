# Tasks: 001-status-usage-card

Check chung (floor): `npx tsc --noEmit` (file sửa 0 lỗi) + `node --experimental-strip-types --test tests/status.test.ts` + `npm test` ≥ 461/40.

- [x] **0.1** Nhánh + speckit init + constitution — check: `.specify/` + `specs/001-*/spec.md` tồn tại.
- [x] **1.1** `lib/status.ts`: thêm `tokens` vào `TelegramContextUsage`, `provider/id` vào `TelegramStatusActiveModel` — check: tsc 0 lỗi file sửa.
- [x] **1.2** `lib/status.ts`: helper `formatTokenCount` (phân cách nghìn) + row `Model` trong `buildStatusHtml` — check: test mới `Model row shows provider/id`.
- [x] **1.3** `buildContextSummary` → `"<tokens> tokens (<pct>% used of <window>)"` (null → `?`, undefined → `unknown`) — check: test 140398→`140,398 tokens (13.4% used of 1M)`.
- [x] **1.4** `buildCostSummary` → `$x.xxxx spent` (+` (sub)`) — check: test `$0.0438 spent` và `(sub)`.
- [x] **2.1** Cập nhật `tests/status.test.ts` expectation cũ (chỉ phần FR đổi) + 3 test mới (tokens format, model row, cost spent) — check: tests pass.
- [x] **2.2 Sabotage** — bỏ dấu phẩy ngăn nghìn → test FAIL; bỏ row Model → test FAIL (chứng minh test bắt bug). Khôi phục.
- [x] **3.1** Release: `package.json` 0.11.0 + `CHANGELOG.md` entry — check: `npm pack --dry-run` OK.
- [x] **4.1** Full check xanh → commit → ff-merge `main` → push → `systemctl --user restart pi-telegram`.
- [ ] **4.2** Smoke live: `/status` trên Telegram trả đủ model + tokens + % + cost (bằng chứng log/ảnh).
