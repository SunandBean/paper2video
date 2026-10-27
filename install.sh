#!/usr/bin/env bash
# paper2video installer / updater (for people who prefer a plain git clone over the plugin marketplace).
#   curl -fsSL https://raw.githubusercontent.com/SunandBean/paper2video/main/install.sh | bash
# Run it again to update. Puts the skill in ~/.claude/skills/paper2video (/paper2video in Claude Code),
# tools in ~/.claude/skills/paper2video/.tools, and your jobs and videos in ~/paper2video.
# Override the skill location with P2V_DIR=/path.
set -euo pipefail
DIR="${P2V_DIR:-$HOME/.claude/skills/paper2video}"
REPO="https://github.com/SunandBean/paper2video.git"
for c in git node npm python3 curl; do command -v "$c" >/dev/null || { echo "paper2video: '$c' is required"; exit 1; }; done
if [ -d "$DIR/.git" ]; then
  echo "== updating $DIR"; git -C "$DIR" pull --ff-only
elif [ -e "$DIR" ]; then
  echo "paper2video: $DIR exists but is not a git clone (symlink or copy?). Move it or set P2V_DIR."; exit 1
else
  echo "== installing into $DIR"; mkdir -p "$(dirname "$DIR")"; git clone --depth 1 "$REPO" "$DIR"
fi
"$DIR/p2v" setup
cat <<MSG

paper2video is ready.
  In Claude Code:   /paper2video https://arxiv.org/abs/2610.30340
  Videos land in:   $("$DIR/p2v" paths | sed -n "s/^export P2V_OUT='\(.*\)'$/\1/p")
  Update later:     run this installer again
MSG
