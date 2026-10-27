#!/usr/bin/env bash
# End-to-end toolchain test. Stops at the first failing step, so a render can never reuse old narration.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=./.venv/bin/python
[ -x "$PY" ] || { echo "FAIL: .venv missing. Run ./setup.sh"; exit 1; }
echo "== 1/4 python deps";  "$PY" -c "import numpy, kokoro_onnx, soundfile, pypdf, supertonic" && echo ok
echo "== 2/4 kokoro tts";   "$PY" - <<'PY'
import sys; sys.argv=['tts','_smoke','--engine','kokoro']
sys.path.insert(0,'scripts'); import tts; tts.main()
PY
echo "== 3/4 render";       node scripts/render.mjs _smoke
echo "== 4/4 claims check"; "$PY" scripts/check_claims.py 2610.30340
if [ "${1:-}" = "--ko" ]; then
  echo "== ko 1/2 supertonic tts (first run downloads the model)"; "$PY" scripts/tts.py _smoke_ko
  echo "== ko 2/2 render";  node scripts/render.mjs _smoke_ko
  echo "Korean: jobs/_smoke_ko/build/_smoke_ko.mp4"
fi
echo "ALL PASS -> jobs/_smoke/build/_smoke.mp4, jobs/_smoke/build/contact.jpg"
