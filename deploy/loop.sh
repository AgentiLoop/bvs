#!/bin/zsh
# Commit, push, and publish the game every 10 minutes.
# Usage: zsh deploy/loop.sh [cycles]   (default 144 cycles = 24 hours)
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"
CYCLES=${1:-144}

for i in {1..$CYCLES}; do
  echo "=== cycle $i/$CYCLES  $(date '+%Y-%m-%d %H:%M:%S') ==="
  cd "$REPO"

  # Commit tracked changes only (untracked files are left alone).
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    git add -u
    git commit -q -m "Auto-commit $(date '+%Y-%m-%d %H:%M')" && echo "committed $(git rev-parse --short HEAD)"
  else
    echo "no changes to commit"
  fi

  # Push and publish only when origin is behind.
  git fetch -q origin main
  if [[ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]]; then
    git push origin main 2>&1 | tail -2
    rm -rf /tmp/bvs_deploy && mkdir -p /tmp/bvs_deploy
    git archive main | tar -x -C /tmp/bvs_deploy
    (cd /tmp/bvs_deploy && zsh deploy/publish.sh 2>&1 | tail -6)
    echo "site: $(curl -s -o /dev/null -w '%{http_code}' https://bvs.agentiloop.ai/)"
  else
    echo "origin up to date, nothing to publish"
  fi

  (( i < CYCLES )) && sleep 600
done
echo "=== loop finished $(date '+%Y-%m-%d %H:%M:%S') ==="
