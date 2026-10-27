# Verification (replaces script approval)

The writer and the verifier must be different contexts. The agent that wrote the script does not
grade it. Spawn a fresh subagent (ideally a different model) that sees only: `paper/paper.txt`,
`paper/meta.json`, `script.json`, `claims.json`, the scene files, `build/VERIFY_auto.md`, `build/preview_*.jpg`,
`build/onscreen.json`, and this file. It runs after the scenes exist and the preview is made (SKILL.md step 9).

## Layer 1. Numbers and sentences (mechanical, `p2v check <id>` = `scripts/check_claims.py`)
Required: **FAIL 0, WARN 0**.

Numbers it looks at: subtitles, narration text, string literals in the job's `.js` files, and `build/onscreen.json`,
the list of every string the player actually drew (written by `p2v preview` and `p2v render`). The last source is
what catches numbers that templates draw from JS values (bar values, axis ticks, `${v.toFixed(1)}s`).
Narration numbers are read both as digits and as English number words ("sixty point nine" = 60.9).
A number counts as covered only through a claim that itself passed, or through `allow_numbers` with a reason
(axis gridlines, animated parameter values, ids, product names like H100 read aloud). A subtitle or narration
number above 10 must also come from a claim whose `used_in` lists that sentence, so a count of 42 objects cannot
vouch for "42% higher". `table` claims are searched only inside the cited table (between the neighbouring captions). Illustrative numbers that are not from the paper must not
appear on screen unless they are labeled as illustrative there.

claims.json kinds:
| kind | required fields | passes when |
|---|---|---|
| `quote` | `quote` (verbatim from paper.txt, prose only, avoid math glyphs) | substring match after whitespace/hyphenation normalization |
| `table` | `table` ("Table 9"), `row` (row label as printed), `values` (exact printed strings) | caption exists and one text line holds the row label and all values |
| `derived` | `from` (claim ids), `derivation` (show the arithmetic), `on_screen_label` | always REVIEW: verifier recomputes |
| `opinion` | `on_screen_label` | always REVIEW: verifier judges framing |

Coverage: every number in subtitles and on-screen string literals must appear in some claim's
`values`/`quote`/`text`/`row`/`table`/`derivation`, or in `allow_numbers` with a reason.
Rounded display values go in the claim `text` next to the exact value ("31.26 (≈31)").

## Layer 2. Conditions and context (verifier)
For each result claim, check the conditions the paper attaches, and that the video keeps them:
- benchmark, split, metric direction (higher/lower is better), units
- comparison set ("among compared methods") and who the baseline is
- training condition (fine-tuned per benchmark? ablation subset? number of cameras?)
- hardware and input size for speed/memory numbers
- whether a number is the paper's headline or a cherry-picked row
Verdict per claim: `ok` / `missing-qualifier` / `misleading` / `wrong`.

## Layer 3. Flow (verifier)
- Script order follows the paper's logic: problem → method → results → limits.
- The paper's own contributions are not confused with prior work it cites (e.g. VGGT, PETR, Instant NuRec).
- The headline claims in the abstract are represented; nothing important is contradicted later in the paper.
- Limitations section is reflected. If a design choice hurt a metric (an ablation got worse), the video does not hide it.
- No claim the paper does not make ("real-time", "state of the art" without qualifier, "first ever").

## Layer 4. Screen (verifier, with `build/preview_*.jpg` or `contact.jpg`)
- On-screen numbers = subtitles = claims (same rounding everywhere).
- Approximations and opinions carry the `on_screen_label` shown in claims.json.
- Text does not overflow panels, collide, or sit under subtitles; nothing important is off-frame.
- Every mechanism scene has a location cue first.

## Layer 5. Licensing (verifier)
- `meta.json.license` and `figure_reuse` recorded in BRIEF.md.
- No paper figures unless allowed; if used, credited with "adapted from ..., CC BY 4.0, changes made".
- No dataset imagery (Waymo, nuScenes, etc.) inside the video unless its terms allow it.
- Voice and music licenses recorded. No logos.

## Output: `jobs/<id>/VERIFY.md`
```
# Verification: <id>
verifier: <model/agent>, date
layer1: FAIL 0 WARN 0 (attach VERIFY_auto summary)
| claim | layer | verdict | note | fix |
...
overall: PASS | FIX-AND-RERUN | BLOCKED (needs user)
```
Loop: fix → re-run layer 1 → re-verify changed claims. Stop after 3 loops and report BLOCKED with
the open items. Only a PASS goes to the final render.
