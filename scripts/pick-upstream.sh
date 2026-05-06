#!/usr/bin/env bash
# pick-upstream.sh — Check llblab upstream & interactively cherry-pick
# Usage: bash scripts/pick-upstream.sh
set -e

UPSTREAM_BRANCH="upstream/main"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "=== Fetching upstream (llblab/pi-telegram)... ==="
git fetch upstream

echo ""
echo "=== New commits from llblab (ahead of maphim) ==="
NEW_COMMITS=$(git log HEAD.."$UPSTREAM_BRANCH" --oneline)
if [ -z "$NEW_COMMITS" ]; then
  echo "  ✨ Không có commit mới nào từ llblab. Bạn đang up-to-date."
  exit 0
fi

echo "$NEW_COMMITS"
echo ""

# Save commit list for picking
echo "$NEW_COMMITS" > /tmp/upstream-commits.txt

echo "=== Enter commit hash(es) to cherry-pick (space-separated), or empty to skip ==="
echo "  VD: abc1234 def5678"
read -r -p "> " HASHES

if [ -z "$HASHES" ]; then
  echo "  Bỏ qua. Không cherry-pick gì."
  exit 0
fi

for HASH in $HASHES; do
  echo ""
  echo "=== Cherry-picking $HASH... ==="
  if git cherry-pick "$HASH"; then
    echo "  ✅ $HASH — ok"
  else
    echo "  ⚠️  Conflict ở $HASH! Resolve xong chạy:"
    echo "     git add . && git cherry-pick --continue"
    echo "  Hoặc hủy: git cherry-pick --abort"
    exit 1
  fi
done

echo ""
echo "✅ Done. Push lên maphim: git push origin $CURRENT_BRANCH"
