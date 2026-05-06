# Upstream Workflow: llblab → maphim

## Git remote

| Remote | URL | Vai trò |
|--------|-----|---------|
| `origin` | `github.com/maphim/pi-telegram.git` | Fork chính — mọi custom code |
| `upstream` | `github.com/llblab/pi-telegram.git` | Repo gốc — chỉ để check & cherry-pick |

## Check — không đụng code, không overwrite

```bash
# Fetch commit mới từ llblab (an toàn tuyệt đối)
git fetch upstream

# Xem có gì mới (trống = không có)
git log HEAD..upstream/main --oneline

# Xem chi tiết
git log HEAD..upstream/main --oneline -10
git show <hash> --stat              # chỉ file thay đổi
git show <hash>                      # full diff
```

## Cherry-pick — chỉ lấy commit mình muốn

```bash
# Một commit
git cherry-pick <hash>

# Dãy commit liên tiếp
git cherry-pick <hash-A>..<hash-B>

# Conflict → resolve xong
git add . && git cherry-pick --continue

# Muốn bỏ → thoát
git cherry-pick --abort
```

## KHÔNG làm

```bash
git pull upstream main        # merge toàn bộ, overwrite code custom
git merge upstream/main        # tương tự
```

## Script helper

```bash
bash scripts/pick-upstream.sh
```

Chạy lên: fetch → show danh sách commit mới → hỏi pick commit nào → cherry-pick.
