# Licensing checklist

Ideas, facts and numbers are not copyrightable; expression (figures, text, tables as images) is.
Explaining in your own words with your own visuals is the default.

| arXiv license | paper figures in the video |
|---|---|
| CC BY 4.0 / CC0 | allowed with attribution; say "adapted from ... (CC BY 4.0), changes made" |
| CC BY-SA 4.0 | allowed; the adapted figure must be CC BY-SA |
| CC BY-NC-* | non-commercial only: avoid if the video earns money |
| CC BY-ND / BY-NC-ND | no modification: avoid |
| arXiv non-exclusive (most papers) | no reuse grant: ask the authors, or draw your own |

The license shows under "Download" on the abs page; `fetch_paper.py` records it in `meta.json`.

Also check:
- Dataset imagery inside figures (Waymo Open, nuScenes, ...) has its own terms that the paper's CC license may not cover. Avoid.
- Company names in narration are fine; logos and liveries are not.
- Fair use is case-by-case; do not rely on it for commercial use. (General guidance, not legal advice.)
- Narration: Kokoro voices (Apache-2.0) are fine. Supertonic 3 (non-English default) weights are OpenRAIL-M: use is allowed, including commercial, subject to the use restrictions in its LICENSE; read it before monetizing. Google Translate TTS: commercial terms unchecked, previews only.
- Music: only tracks whose license covers how the video will be used; record the source in BRIEF.md.
- Description credit: title, authors, arXiv link, license, "not affiliated with the authors".
