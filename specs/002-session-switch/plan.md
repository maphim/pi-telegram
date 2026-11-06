# Implementation Plan: 002-session-switch

## Research
| Câu hỏi | Kết quả |
|---|---|
| pi CLI hỗ trợ gì? | `--session <path\|id>` (chọn session), `-c` (continue), `--fork`, `--session-dir` |
| Session lưu đâu? | `<project>/.pi/sessions/<ISO>_<uuid>.jsonl`; dòng đầu `{"type":"session",...}` |
| Có API đọc session hiện tại? | `ReadonlySessionManager.getSessionDir/getSessionFile/getSessionId` (trong ctx) |
| Wrapper hiện tại? | `-c` mặc định; marker `/tmp/pi-force-new-session` → `rm -rf` session dir (ĐỘC HẠI) |
| Bridge tự restart thế nào? | ghi marker rồi `process.exit(0)`; systemd (user) restart wrapper |

## Thay đổi
1. **`lib/sessions.ts` (mới)**: parse tên file, list + preview (fs), dựng text list, resolve lựa chọn, marker contract.
2. **`lib/commands.ts`**: reserved `sessions/resume/new`; action table; 3 handler (idle guard); `/restart` ghi marker `new`
   thay vì signal purge; greeting cập nhật; menu bot += 3 lệnh; helper `getTelegramSessionPorts(ctx)`.
3. **`~/.pi/telegram-wrapper.sh`**: đọc marker → `--session`/session mới; fallback `-c`; legacy signal = new session KHÔNG xoá.
4. **`tests/sessions.test.ts` (mới)** + test menu/reserved trong `tests/commands.test.ts`.

## Check command
```
export PATH=/home/anhnc/.nvm/versions/node/v22.22.2/bin:$PATH
cd ~/.pi/agent/git/github.com/maphim/pi-telegram
node --experimental-strip-types --test tests/sessions.test.ts tests/commands.test.ts
npx tsc --noEmit   # 89 lỗi pre-existing, 0 lỗi file sửa
node --experimental-strip-types --test tests/*.test.ts
```

## Rủi ro
- Restart giữa turn = mất câu trả lời → idle guard bắt buộc.
- Marker cũ còn sót → wrapper fallback `-c`; test marker contract.
- Session dir chứa file lạ → pattern tên file lọc chặt.
