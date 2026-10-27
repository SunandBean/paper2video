#!/usr/bin/env bash
# paper2video installer / updater (for people who prefer a plain git clone over the plugin marketplace).
#   curl -fsSL https://raw.githubusercontent.com/SunandBean/paper2video/main/install.sh | bash
# Run it again to update. Puts the skill in ~/.claude/skills/paper2video (/paper2video in Claude Code),
# tools in ~/.claude/skills/paper2video/.tools, and your jobs and videos in ~/paper2video.
# Override the skill location with P2V_DIR=/path.
set -euo pipefail

# Everything runs inside main, called on the last line, so a download cut off halfway executes nothing.
main() {
  local dir="${P2V_DIR:-$HOME/.claude/skills/paper2video}" repo="https://github.com/SunandBean/paper2video.git" c
  for c in git node npm python3 curl; do command -v "$c" >/dev/null || { echo "paper2video: '$c' is required"; exit 1; }; done
  if [ -d "$dir/.git" ]; then
    echo "== updating $dir"
    git -C "$dir" pull --ff-only || { echo "paper2video: could not fast-forward $dir (local changes?). Resolve them, then run this again."; exit 1; }
  elif [ -e "$dir" ]; then
    echo "paper2video: $dir exists but is not a git clone (symlink or copy?). Move it or set P2V_DIR."; exit 1
  else
    echo "== installing into $dir"; mkdir -p "$(dirname "$dir")"; git clone --depth 1 "$repo" "$dir"
  fi
  "$dir/p2v" setup
  local videos; videos=$("$dir/p2v" paths | sed -n "s/^export P2V_OUT='\(.*\)'$/\1/p")
  printf '\npaper2video is ready.\n  In Claude Code:   /paper2video https://arxiv.org/abs/2610.30340\n  Videos land in:   %s\n  Update later:     run this installer again\n' "$videos"
}

main "$@"
