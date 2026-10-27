---
name: paper2video
description: Turn an arXiv paper into a narrated, fact-checked explainer video (1080p MP4) with animated 2D/3D scenes, subtitles and a verification report. Run with /paper2video <arxiv link or id> [overrides].
argument-hint: <arxiv link or id> [overrides]
disable-model-invocation: true
license: MIT
compatibility: Claude Code with a local shell. Needs Node 18+, Python 3.10-3.13, ~1 GB disk (voice model + headless Chromium). Run ./setup.sh once.
---

# paper2video

Paper in, explainer video out. The user picks the paper; everything after that is this workflow, with
**strict cross-checking instead of script approval**. The skill never publishes anything.

Paper to process: **$ARGUMENTS**

Skill folder: `${CLAUDE_SKILL_DIR}`. `cd` there first; all commands run from it.
Job outputs go to `$P2V_JOBS` if set, otherwise `${CLAUDE_SKILL_DIR}/jobs/`.
If `.venv/` is missing, run `./setup.sh` first (one time).

## Input
Only the arXiv link or id is required (`https://arxiv.org/pdf/2610.35607`, `.../abs/...v2`, `2610.35607`).
Anything after it is an override (e.g. `3 min`, `voice am_michael`). Do not ask for more instructions.
Run the whole pipeline below with these defaults:

| Default | Value | User can override with |
|---|---|---|
| Length | 4-5 min, 10-14 scenes | "3 min" |
| Language / voice | English, Kokoro `af_heart` | another Kokoro voice id |
| Verification | step 6 always runs in a **fresh-context subagent**, all 5 layers; equations and derivations (not machine-checkable) are checked by the verifier against paper.txt with the evidence written in VERIFY.md | n/a (never skipped) |
| Fix loop | fix and re-verify up to 3 rounds, then stop with BLOCKED and the open items | n/a |
| Templates | move any new scene that would work for other papers into `engine/templates.js` | n/a |
| Publishing | never upload or post anywhere; the MP4 is the end product | n/a |
| Git | do not commit; leave changes for review | "commit it" |

Only stop to ask the user when blocked (license forbids the planned visuals, the PDF has no text layer,
verification BLOCKED after 3 rounds, or a toolchain step fails twice).

## Final report (always, at the end)
Per step: done / failed + output path · VERIFY.md verdict and open items · video path + length ·
new templates added · wall-clock time · anything the user should look at first.
One-time setup: `./setup.sh` (node deps, ffmpeg, Playwright Chromium, Python 3.10-3.13 venv, Kokoro voice models).
If the default `python3` is 3.14+, setup picks python3.13/3.12 automatically, or set `PYTHON=/path/to/python3.12`.
Use `./.venv/bin/python` for the Python scripts.

## Pipeline

| # | Step | Command / output |
|---|---|---|
| 1 | Fetch paper + license | `./.venv/bin/python scripts/fetch_paper.py <arxiv id or link>` → `jobs/<id>/paper/{meta.json,paper.pdf,paper.txt}` and job skeleton |
| 2 | Read + outline | Read `paper.txt` fully. Fill `jobs/<id>/BRIEF.md` (license block first, outline that follows the paper's own logic, shot list) |
| 3 | Script | `jobs/<id>/script.json`: scenes → sentences `[subtitle, tts_text]` |
| 4 | Claims | `jobs/<id>/claims.json`: every factual statement and every on-screen number, with source |
| 5 | Mechanical check | `./.venv/bin/python scripts/check_claims.py <id>` → must be **FAIL 0, WARN 0** |
| 6 | Independent verification | Fresh-context verifier subagent per `references/verification.md` → `jobs/<id>/VERIFY.md`. Fix and loop until it passes |
| 7 | Scenes | `jobs/<id>/scenes.js` (templates + custom). See `references/scene-authoring.md` |
| 8 | Narration + timing | `./.venv/bin/python scripts/tts.py <id>` → `build/narration.wav`, `build/timing.json` |
| 9 | Preview QA | `node scripts/render.mjs <id> --preview` → `build/preview_*.jpg`. Look at every sheet (overflow, overlap, blank, legibility, camera inside geometry) |
| 10 | Render | `node scripts/render.mjs <id>` → `build/<id>.mp4` + `build/contact.jpg` (no Playwright: `--manual`, open the URL in any browser) |
| 11 | Final checks | Re-run step 5 (scenes may have added numbers). Watch `contact.jpg` |
| 12 | Report | Final report (below). If `local/*.md` exists in the skill folder, follow those personal add-on steps after this one |

Re-runs: steps 8 to 11 are idempotent. Change `script.json` → re-run 5, 8, 9, 10.

## Hard rules
- **License first.** `meta.json.figure_reuse` decides whether paper figures may appear. Default: draw everything yourself; never paste paper figures or dataset camera images unless the license allows it (`references/licensing.md`). No company logos.
- **No unsourced numbers.** Every number in subtitles or on-screen strings must be covered by `claims.json`. Rounded numbers must state the exact source value in the claim `text` (e.g. "141.72 → shown as 142").
- **Keep the paper's conditions.** "Best" needs its qualifiers ("among compared methods", "after benchmark-specific fine-tuning", ablation setting, hardware).
- **Label approximations and opinions on screen**, not only in the claims file (`derived` / `opinion` kinds need `on_screen_label`).
- **Show where before how.** Open each mechanism with a location/context cue (what part of the system, where on the car) before the mechanism itself.
- **Narration:** Kokoro (Apache-2.0) is the default and is cleared for public use. Do not swap in voices whose terms for public or commercial use are unchecked.
- **Plain language.** Expand jargon on first use; one concrete number beats three abstract sentences.

## Files
- `engine/` timeline player (`main.js`), 3D/2D primitives (`core.js`), reusable templates (`templates.js`)
- `scripts/` fetch, tts, check_claims, serve/render (frames → MP4 via ffmpeg)
- `templates/job/` skeleton copied into new jobs
- `jobs/2610.30340/` complete worked example (Foundation4D, 14 scenes, 66 claims, 4.6 min)
- `jobs/_smoke/` 15-second template-only job for testing the toolchain (`tts.py _smoke` uses the silent engine)
- `references/` verification, scene authoring, licensing
- `local/` (optional, git-ignored) your own add-on steps, e.g. a publishing checklist

## Smoke test (after ./setup.sh)
```bash
./scripts/smoke.sh   # stops at the first failing step; render.mjs refuses stale narration
```
