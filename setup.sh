#!/usr/bin/env bash
# One-time setup. Run in a normal terminal (not inside a restricted sandbox).
set -euo pipefail
cd "$(dirname "$0")"
echo "== node deps (three, ffmpeg-static, playwright)"
npm install --no-fund --no-audit
# ffmpeg-static downloads its binary in a postinstall script; run it if npm skipped scripts.
[ -x node_modules/ffmpeg-static/ffmpeg ] || node node_modules/ffmpeg-static/install.js
npx --yes playwright install chromium || echo "!! playwright chromium install failed: use 'render.mjs --manual' with any browser"
echo "== python deps (.venv)"
# kokoro-onnx needs Python 3.10-3.13 (no 3.14 wheels yet). Pick the first suitable interpreter.
pick_python() {
  local c v
  for c in "${PYTHON:-}" python3.13 python3.12 python3.11 python3.10 \
           /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 \
           /usr/local/bin/python3.13 /usr/local/bin/python3.12 /usr/local/bin/python3.11 \
           /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
           /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
           python3; do
    [ -n "$c" ] || continue
    command -v "$c" >/dev/null 2>&1 || [ -x "$c" ] || continue
    v=$("$c" -c 'import sys; print("%d%02d" % sys.version_info[:2])' 2>/dev/null) || continue
    if [ "$v" -ge 310 ] && [ "$v" -le 313 ]; then echo "$c"; return 0; fi
  done
  return 1
}
PY=$(pick_python) || { echo "!! Need Python 3.10-3.13 for kokoro-onnx. Install one (brew install python@3.12) or set PYTHON=/path/to/python3.12"; exit 1; }
echo "using $PY ($("$PY" -V))"
if [ -x .venv/bin/python ]; then
  vv=$(./.venv/bin/python -c 'import sys; print("%d%02d" % sys.version_info[:2])')
  if [ "$vv" -lt 310 ] || [ "$vv" -gt 313 ]; then echo "rebuilding .venv (was Python $vv)"; rm -rf .venv; fi
fi
[ -x .venv/bin/python ] || "$PY" -m venv .venv
./.venv/bin/pip install -q --upgrade pip
./.venv/bin/pip install -q -r requirements.txt
echo "== kokoro voice models (~350 MB) -> models/"
mkdir -p models
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "models/$f" ] || curl -fL -o "models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
done
if [ "$(uname)" = "Darwin" ]; then
  # Downloaded binaries can carry com.apple.quarantine and get killed (SIGKILL) on first run.
  xattr -cr node_modules/ffmpeg-static models .venv 2>/dev/null || true
fi
command -v pdftotext >/dev/null || echo "note: pdftotext not found (brew install poppler). fetch_paper.py falls back to pypdf."
echo "== check"
node -e "import('./scripts/lib.mjs').then(m=>console.log('ffmpeg:', m.resolveFfmpeg(process.cwd())))"
./.venv/bin/python -c "import kokoro_onnx, soundfile, pypdf; print('python deps ok')"
echo "done. Toolchain test: ./scripts/smoke.sh"
