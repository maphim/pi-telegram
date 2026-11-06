# Feature Specification: Session switch trong Telegram (/sessions, /resume, /new)

**Feature Branch**: `main` (SDD 002) · **Status**: implemented 2026-11-07
**Input**: Chủ hỏi *"có thêm chức năng switch session cho pi-telegram được không, hay chỉ nên là 1 session thôi?"*
→ chốt: **1 session active tại một thời điểm**, có switch; không chạy nhiều session song song.

## User Scenarios

### US1 (P1) — Xem và chuyển session
Chủ gõ `/sessions` → thấy 10 session gần nhất (số, giờ bắt đầu, dung lượng, 8 ký tự id, preview tin đầu, dấu "(đang dùng)").
Gõ `/resume 2` hoặc `/resume 01a1b31a` → bridge restart vào đúng session đó, báo lại id + giờ.

### US2 (P1) — Session mới không mất lịch sử
Gõ `/new` → mở session mới tinh; **session cũ vẫn còn** trong danh sách để resume.
`/restart` giữ nguyên công dụng (restart bridge + session mới + cost reset) nhưng **không xoá** lịch sử session
(trước đây wrapper `rm -rf` thư mục session mỗi lần restart).

## Requirements

- **FR-001**: `/sessions` liệt kê tối đa 10 session, sắp theo hoạt động mới nhất, có preview từ tin nhắn user đầu tiên.
- **FR-002**: `/resume <số|id-prefix ≥4>` chuyển session đúng; sai/không khớp → báo lỗi rõ, không đổi gì.
- **FR-003**: `/new` mở session mới, giữ toàn bộ file session cũ.
- **FR-004**: Cả 3 lệnh chỉ chạy khi π **idle**; đang chạy turn → từ chối kèm hướng dẫn (/abort|/stop).
- **FR-005**: Cơ chế = marker `/tmp/pi-telegram-session.json` (`{"mode":"new"}` | `{"mode":"session","session":"<path>"}`)
  do bridge ghi rồi tự exit; wrapper đọc marker, chạy `pi --session <path>` hoặc session mới (`-c` khi không marker).
- **FR-006**: Marker hỏng/thiếu file → wrapper fallback `-c`, ghi log debug (không mất bridge).
- **FR-007**: 3 lệnh có trong menu Telegram (`setMyCommands`) + reserved names (không bị prompt-template chiếm).

## Success Criteria
- **SC-001**: `tests/sessions.test.ts` phủ parse tên file, sort, preview, resolve (index/prefix/ambiguous/missing), marker JSON.
- **SC-002**: `npm test` ≥ baseline (474 pass / 40 fail pre-existing); typecheck 89 pre-existing, 0 lỗi file sửa.
- **SC-003**: Sabotage: sai chiều sort / bỏ resolve prefix / marker luôn "new" → test FAIL tương ứng.
- **SC-004**: Live: `/sessions` trả danh sách; `/resume` khởi động lại đúng session; `.pi/sessions/` không bị xoá.

## Non-goals
- Nhiều session song song / multi-process.
- Fork session từ Telegram (pi có `--fork`; để spec sau nếu chủ cần).
- Đặt tên session, xoá session từ Telegram.
