# pi-telegram Constitution

> Telegram bridge cho π (maphim/pi-telegram). Nguồn sự thật kỹ thuật = `tests/invariants.test.ts`
> + `tests/*.test.ts`. Constitution này chỉ chốt điều kiện nghiệm thu KHÔNG được thoả hiệp.

## Core Principles

### I. Không được hồi quy (NON-NEGOTIABLE)
Baseline đo được phải giữ hoặc tốt lên:
- `npm test` → tối thiểu **461 pass / 40 fail** (40 fail là pre-existing, không được tăng).
- `npx tsc --noEmit` → 89 lỗi pre-existing (không được tăng; **file bị sửa phải 0 lỗi**).
- `/status`, menu model, queue: format cũ không được đổi ngoài phạm vi spec.

### II. Bất biến kiến trúc là luật
- `index.ts` = composition root: **không** `=>`, không `function` cục bộ, không `pi.` usage, không `node:` import.
- Import π SDK chỉ trong `lib/pi.ts`. Domain import không chu trình (domain DAG).
- File nguồn phải có header `/**` + dòng ` * Zones: ...`.
- Menu domain không re-export model; domain lá (polling/setup/status) không import domain khác.

### III. Test phải chứng minh hành vi
Mỗi feature/fix → có test **fail khi xoá code feature** (sabotage proof), không phải test trang trí.
Số liệu trình bày cho chủ tuyệt đối không được bịa — không biết thì `?`/`unknown`.

### IV. Honesty & ngôn ngữ cho chủ
Text hướng chủ = tiếng Việt, ngắn, thân thiện; emoji iOS smiley hoặc emoji trạng thái chức năng (⚠️/✅/🔁).
Không lộ token bot, không lộ nội dung hệ thống.

### V. Bridge tự phục vụ, không tốn model
Lệnh điều khiển (/status, /model, /keys, /queue...) phải chạy trong bridge, KHÔNG tốn lượt model.
Mọi thông tin trạng thái lấy từ runtime π (sessionManager/cost/context), không gọi API ngoài.

## Sửa đổi
Sửa constitution phải qua commit ghi rõ lý do đo được (kèm số liệu trước/sau).
