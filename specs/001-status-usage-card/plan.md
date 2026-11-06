# Implementation Plan: 001-status-usage-card

**Branch**: `feat/status-usage-card` | **Spec**: `./spec.md`

## Research (đã kiểm chứng trong code)

| Câu hỏi | Kết quả |
|---|---|
| Context usage lấy ở đâu? | `ctx.getContextUsage()` (π ExtensionContext) → `{ tokens: number\|null; contextWindow: number; percent: number\|null }` |
| `status.ts` đã nhận gì? | structural port `TelegramContextUsage { contextWindow?, percent }` — **thiếu `tokens`** |
| Model active có id/provider? | có (`ActivePiModel.provider/.id`), nhưng `TelegramStatusActiveModel` chỉ khai `contextWindow` |
| Cost lấy ở đâu? | `sessionManager.getEntries()` → message.usage.cost.total (đã có `collectUsageStats`, `isCostResetActive`) |
| /status render ở đâu? | `buildStatusHtml` (status.ts:572) → `createTelegramAppMenuHtmlBuilder` (commands.ts:625) |
| Có chỗ nào khác hiển thị model? | menu /model dùng canonical id; không đổi trong spec này |

## Thay đổi kỹ thuật (mỗi mục 1 file)

1. **`lib/status.ts`**
   - `TelegramContextUsage` thêm `tokens?: number | null`.
   - `TelegramStatusActiveModel` thêm `provider?: string; id?: string`.
   - Helper `formatTokenCount(n)` — phân cách hàng nghìn bằng dấu phẩy (tự viết, không locale).
   - `buildStatusHtml`: thêm row `Model` đầu tiên (`provider/id`); giữ nguyên Status/Usage/Cost/Context.
   - `buildContextSummary`: `"<tokens> tokens (<pct>% used of <window>)"`, fallback `?`/`unknown` theo FR-004.
   - `buildCostSummary`: `$x.xxxx spent` + ` (sub)`.
2. **`index.ts`** — không đổi (composition root đã truyền model + ctx; `getContextUsage` đã có `tokens`).
3. **`tests/status.test.ts`** — cập nhật expectation cũ + test mới cho format/round-trip số liệu.

## Check command (floor)

```
cd ~/.pi/agent/git/github.com/maphim/pi-telegram && \
  npx tsc --noEmit | grep -E "^(index\.ts|lib/status\.ts|tests/status\.test\.ts)" ; \
  node --experimental-strip-types --test tests/status.test.ts tests/invariants.test.ts && npm test | tail -8
```

## Rủi ro & giảm thiểu

- **Test cũ assert format Context/Cost** → phải sửa đồng bộ, review kỹ để không "sửa test theo code".
  Cách chắc: đọc expectation cũ trước khi sửa, chỉ đổi phần spec yêu cầu (thêm tokens + "used of" + "spent").
- **`percent` null** (vừa compact) → `?`; không crash.
- **Model undefined** (chưa có session) → bỏ row Model (không in "undefined").
