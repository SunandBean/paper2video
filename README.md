# paper2video

A Claude Code skill: arXiv paper in, narrated and fact-checked explainer video out.

```
/paper2video https://arxiv.org/abs/2610.30340
```

- **Scenes:** Three.js (3D) + canvas (2D), timed to the narration; reusable templates plus custom scenes per paper
- **Narration:** English by default (Kokoro, local, Apache-2.0); Korean and 30 other languages with `ko`, `ja`, ... (Supertonic 3, local, OpenRAIL-M). No API keys
- **Cross-check:** every number and claim is tied to a quote or table row in the paper and checked mechanically (`scripts/check_claims.py`), then by an independent verifier subagent (`references/verification.md`)
- **Output:** 1080p30 MP4, contact sheet, verification report. It never uploads or posts anything.

## Install

Requires Claude Code, Node 18+, Python 3.10-3.13, ~1 GB disk.

```bash
git clone https://github.com/SunandBean/paper2video ~/.claude/skills/paper2video      # or clone anywhere and symlink it there
cd ~/.claude/skills/paper2video
./setup.sh            # node deps, ffmpeg, headless Chromium, Python venv, voice model
./scripts/smoke.sh    # toolchain test, should end with ALL PASS (add --ko to test Korean)
```

## Use

In any Claude Code session:

```
/paper2video <arxiv link or id> [overrides]
/paper2video 2610.35607 3 min, voice am_michael
/paper2video 2610.35607 한국어
```

The skill only runs when you call it (`disable-model-invocation: true`); pasting a paper link in a normal chat does nothing special.

Finished videos appear in `videos/` with readable names (e.g. `videos/2610.30340_Foundation4D.mp4`); set `P2V_OUT` to use another folder.
Working files stay in `jobs/<id>/` (or `$P2V_JOBS/<id>/`). `node scripts/collect.mjs` re-collects all finished videos.
Unattended run from a terminal or another bot: `./run.sh <arxiv link or id>`.

## What's inside

- `SKILL.md` workflow and defaults the agent follows
- `engine/` timeline player, 3D/2D primitives, templates
- `scripts/` fetch (with license detection), TTS, claims check, render/mux, smoke test
- `references/` verification layers, scene authoring, licensing
- `local/` optional, git-ignored: put your own extra steps here (e.g. a publishing checklist); the skill runs them after its final report
- `jobs/2610.30340/` worked example (Foundation4D, NVIDIA, CC BY 4.0), `jobs/_smoke/`, `jobs/_smoke_ko/` toolchain tests

License: MIT (see LICENSE). The example job includes text from the Foundation4D paper (arXiv 2610.30340, NVIDIA, CC BY 4.0).

Third-party: three.js (MIT), ffmpeg-static (downloads a GPL-3.0 FFmpeg build at install), kokoro-onnx (MIT) and Kokoro-82M weights (Apache-2.0), supertonic (MIT code, Supertonic 3 weights under OpenRAIL-M), Playwright (Apache-2.0).
Korean subtitles need a Korean font (built into macOS; on Linux install Noto Sans CJK).
