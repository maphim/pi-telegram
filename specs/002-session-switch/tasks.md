# Tasks: 002-session-switch

- [x] **1.1** `lib/sessions.ts`: parse/list/preview/format — check: `tests/sessions.test.ts` pass.
- [x] **1.2** `resolveTelegramSessionChoice` (index, prefix ≥4, ambiguous/missing) — check: test resolve.
- [x] **1.3** Marker contract `buildTelegramSessionSwitchMarker` — check: test marker JSON.
- [x] **2.1** `commands.ts`: reserved + action table + menu bot cho `sessions/resume/new` — check: test reserved/menu.
- [x] **2.2** Handlers `/sessions`, `/resume`, `/new` (idle guard, lỗi rõ ràng) — check: tsc 0 lỗi file sửa.
- [x] **2.3** `/restart` ghi marker `new` (không purge lịch sử) — check: code review + live.
- [x] **3.1** Wrapper đọc marker (`--session`/session mới), legacy = giữ lịch sử — check: `bash -n` + live.
- [x] **3.2 Sabotage**: sort / resolve prefix / marker → test FAIL 1/7 mỗi case.
- [ ] **4.1** Live: `/sessions` + `/resume 1` + `/new` trên Telegram; `.pi/sessions/` giữ file cũ.
- [x] **4.2** Release 0.12.0 + CHANGELOG + push + bridge restart + re-register menu.
