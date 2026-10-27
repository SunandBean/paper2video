#!/usr/bin/env bash
# Unattended run (for Grok Bot, cron, or a quick terminal call):
#   ./run.sh https://arxiv.org/pdf/2610.35607 ["optional overrides"]
# Interactive alternative: in any Claude Code session, type /paper2video <link>.
set -euo pipefail
cd "$(dirname "$0")"
[ $# -ge 1 ] || { echo "usage: ./run.sh <arxiv link or id> [overrides]"; exit 2; }
ID=$(python3 -c 'import re,sys; m=re.search(r"(\d{4}\.\d{4,5})", sys.argv[1]); print(m.group(1) if m else "")' "$1")
[ -n "$ID" ] || { echo "not an arXiv link or id: $1"; exit 2; }
mkdir -p logs
echo "paper2video: $ID  (log: logs/$ID.json)"
claude -p "/paper2video $*" \
  --permission-mode acceptEdits \
  --allowedTools "Bash(./.venv/bin/python *),Bash(node scripts/*),Bash(./scripts/*),Bash(ls *),Bash(cat *),Bash(head *),Bash(wc *),Bash(grep *),Read,Write,Edit,Glob,Grep,Task,Agent" \
  --output-format json > "logs/$ID.json"
./.venv/bin/python -c "import json,sys; d=json.load(open('logs/$ID.json')); print(d.get('result','')); sys.exit(1 if d.get('is_error') else 0)"
