# Feature Specification: Model usage card trong /status (kiểu opencode)

**Feature Branch**: `feat/status-usage-card`
**Status**: Draft (implement ngay sau analyze)
**Input**: Chủ yêu cầu: *"update pi-telegram trả về thông tin khi check model đang sử dụng:
Context 140,398 tokens / 13% used / $0.04 spent như opencode"*

## User Scenarios

### US1 (P1) — Check model đang dùng thấy đủ 3 thứ
Chủ gõ `/status` (kênh Telegram hoặc trong app menu) và thấy ngay:
model đang chạy, context đã dùng (số token tuyệt đối), % đã dùng, số tiền session đã tiêu.

**Acceptance**: Given model active `amd/MiMo-V2.6-Flash`, context `140,398` tokens / 1M (13.4%), cost `$0.0438`;
Then reply chứa `amd/MiMo-V2.6-Flash`, `140,398 tokens`, `13.4% used`, `$0.0438 spent`.

### US2 (P2, hoãn) — Menu /model chi tiết cũng thấy usage
Muốn chọn model mà vẫn thấy chi phí/context hiện tại. **Out of scope** spec này:
cần plumb usage vào menu state (buildState ctx tối thiểu) → làm spec riêng khi cần.

## Requirements

- **FR-001**: `/status` có row `Model` = canonical id `provider/id` của model active.
- **FR-002**: row `Context` = `"<tokens> tokens (<pct>% used of <window>)"`; tokens có dấu phẩy
  ngăn nghìn (ví dụ `140,398`); pct 1 chữ số thập phân; window rút gọn (`1M`, `256k`).
- **FR-003**: row `Cost` = `"$<4dp> spent"`, thêm `" (sub)"` khi model dùng OAuth/subscription.
- **FR-004**: Honesty: `tokens === null` (ngay sau compaction) → `"?"`; `getContextUsage()` undefined
  → `"unknown"` (giữ nguyên hành vi cũ). Không bịa số.
- **FR-005**: Không đổi row `Status`, `Usage`, không đổi lệnh/format nào khác ngoài phạm vi này.
- **FR-007**: Menu lệnh của bot (Telegram `setMyCommands`) phải chứa các lệnh bridge tự phục vụ
  `status`, `model`, `thinking`, `queue`, `help` — chủ chọn được từ danh sách, không phải gõ tay.
  (Phát hiện 2026-11-07 sau khi ship: menu chỉ có start/compact/next/continue/abort/stop/restart.)
- **FR-006**: Không thêm API call ngoài; toàn bộ số liệu lấy từ `getContextUsage()` + `sessionManager`
  (bridge tự phục vụ, không tốn lượt model).

## Success Criteria

- **SC-001**: `/status` reply chứa đủ 4 thông tin: model canonical id, tokens tuyệt đối, % used, cost spent.
- **SC-002**: `npm test` ≥ baseline (461 pass / 40 fail pre-existing); `tsc --noEmit` file bị sửa 0 lỗi.
- **SC-003**: Sabotage: bỏ dấu phẩy ngăn nghìn (hoặc bỏ row Model) → test FAIL tương ứng.
- **SC-005**: Menu `/` của bot Telegram có `/status` (và model/thinking/queue/help) ngay sau restart;
  test `Bot command menu exposes the bridge-served commands` chứng minh.
- **SC-004**: Không hồi quy các test status/menu/queue hiện có (cùng bộ pass/fail trước-sau trừ test mới).

## Clarify Decisions (chốt 2026-11-07)

1. **Format số**: dấu phẩy ngăn nghìn kiểu `140,398` (giống opencode), tự implement — không phụ thuộc locale máy.
2. **Độ chính xác**: pct 1 chữ số thập phân; cost 4 chữ số thập phân (opencode hiển thị 2dp/0dp nhưng
   model free/rẻ cần thấy chi phí thật, làm tròn 2dp thành $0.00 là giấu thông tin).
3. **Nơi hiển thị**: mở rộng `/status` — đúng flow "check model đang dùng"; KHÔNG tạo lệnh mới.
4. **Menu /model chi tiết**: hoãn (US2) — tránh nhét usage vào state builder tối thiểu.

## Out of Scope
- Per-model cost breakdown, ngân sách, cảnh báo hết tiền.
- Lịch sử cost theo ngày (đã có ở meow, không thuộc pi-telegram).
