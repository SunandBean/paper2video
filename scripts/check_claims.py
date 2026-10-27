#!/usr/bin/env python3
"""Mechanical cross-check (layer 1 of references/verification.md).

    python3 scripts/check_claims.py <job>

Checks jobs/<job>/claims.json against paper/paper.txt and the script/scenes:
  * kind=quote   the quote appears verbatim (whitespace/hyphenation-insensitive) in the paper text
  * kind=table   a table line contains the row label and every listed value; the table caption exists
  * kind=derived needs `from` (existing claim ids), `derivation`, and `on_screen_label`
  * kind=opinion needs `on_screen_label` (how the video marks it as interpretation)
  * coverage     every number in subtitles, narration text, string literals in the job's .js files, and
                 build/onscreen.json (every string the player actually drew; written by `p2v preview`
                 and `p2v render`) is covered by some claim (values / quote / text) or by `allow_numbers`
Writes build/VERIFY_auto.md. Exit code 1 if anything FAILs. WARNs go to the verifier for judgment.
"""
import json, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p2v_paths import JOBS  # noqa: E402

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('\u2212', '-').replace('\u2013', '-').replace('\u2014', '-').replace('\u00ad', '')
    s = re.sub(r'-\s*\n\s*', '', s)            # de-hyphenate line breaks
    s = re.sub(r'\s+', ' ', s)
    return s.lower().strip()

# A shown number keeps its sign, exponent and power, so "-3" is not covered by "3", nor "1e-3" by "1" and "3".
# A minus counts as a sign only when it does not follow a word character ("2-3" is a range: 2 and 3).
NUM = re.compile(r'(?<![\w.])([-+]?)(\d+(?:[.,]\d+)*)((?:[eE][-+]?\d+)|(?:\^\{?[-+]?\d+\}?))?')
def nums(s):
    s = re.sub(r'[\u2460-\u24ff\u2776-\u2793]', ' ', s)   # circled step numbers (①, ⑪) are labels, not data
    s = unicodedata.normalize('NFKC', s).replace('\u2212', '-')
    out = []
    for m in NUM.finditer(s):
        if re.match(r'-?D(?![A-Za-z])', s[m.end():]) and not m.group(3): continue   # "3D", "4D", "1-D": names, not data
        sign, v, ex = m.group(1), m.group(2), m.group(3) or ''
        v = v.replace(',', '') if re.fullmatch(r'\d{1,3}(,\d{3})+', v) else v
        ex = ex.replace('{', '').replace('}', '').replace('E', 'e')
        v = v.rstrip('.')
        # 67.0 and 67 are the same value; "1.000" may be a European thousand, so it is left as written
        if '.' in v and ',' not in v and not re.fullmatch(r'\d{1,3}\.\d{3}', v): v = v.rstrip('0').rstrip('.')
        out.append(('-' if sign == '-' else '') + v + ex)
    return out

# Numbers spoken as English words in TTS text ("sixty point nine", "forty-seven", "two hundred and twelve").
# A lone "one" or "zero" is skipped ("one model", "measure-zero"); punctuation ends a number ("three, one hundred").
_UNITS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen '
                                      'fifteen sixteen seventeen eighteen nineteen'.split())}
_TENS = {w: 10 * i for i, w in enumerate('_ _ twenty thirty forty fifty sixty seventy eighty ninety'.split()) if i >= 2}
_SCALE = {'hundred': 100, 'thousand': 1000, 'million': 10 ** 6, 'billion': 10 ** 9}
def spoken_numbers(s):
    toks = re.findall(r"[a-z]+|[,.;:!?]", s.lower().replace('-', ' '))
    out, i = [], 0
    while i < len(toks):
        if toks[i] == 'point' and i + 1 < len(toks) and (toks[i + 1] == 'oh' or toks[i + 1] in _UNITS and _UNITS[toks[i + 1]] < 10) \
                and not (i and (toks[i - 1] in _UNITS or toks[i - 1] in _TENS)):        # "point five" = 0.5
            j, d = i + 1, ''
            while j < len(toks) and (toks[j] == 'oh' or toks[j] in _UNITS and _UNITS[toks[j]] < 10): d += str(_UNITS.get(toks[j], 0)); j += 1
            out.append(('0.' + d).rstrip('0').rstrip('.') or '0'); i = j; continue
        if toks[i] not in _UNITS and toks[i] not in _TENS and not (toks[i] == 'a' and i + 1 < len(toks) and toks[i + 1] in _SCALE):
            i += 1; continue
        j, total, cur, words = i, 0, 0, 0
        while j < len(toks):
            t = toks[j]
            if 10 <= cur <= 99 and not total and words in (1, 2) and t == 'oh' and j + 1 < len(toks) \
                    and toks[j + 1] in _UNITS and 0 < _UNITS[toks[j + 1]] < 10:          # "nineteen oh five" = 1905
                cur = cur * 100 + _UNITS[toks[j + 1]]; j += 2; words += 2; break
            two_digit_next = (t in _TENS) or (t in _UNITS and _UNITS[t] >= 10)
            if 10 <= cur <= 99 and not total and two_digit_next and words in (1, 2):
                # year reading: "nineteen ninety" = 1990, "twenty twenty six" = 2026
                nxt = _TENS.get(t, _UNITS.get(t, 0)); j += 1; words += 1
                if t in _TENS and j < len(toks) and toks[j] in _UNITS and 0 < _UNITS[toks[j]] < 10: nxt += _UNITS[toks[j]]; j += 1; words += 1
                cur = cur * 100 + nxt; break
            if t in _UNITS:
                if cur % 10 or 10 <= cur % 100 < 20: break          # "three one" / "twelve three" are two numbers
                cur += _UNITS[t]
            elif t in _TENS:
                if cur % 100: break
                cur += _TENS[t]
            elif t == 'a' and j + 1 < len(toks) and toks[j + 1] in _SCALE: cur += 1
            elif t in _SCALE and (cur or total):
                if _SCALE[t] == 100: cur *= 100
                else: total += cur * _SCALE[t]; cur = 0
            elif t == 'and' and words and j + 1 < len(toks) and (toks[j + 1] in _UNITS or toks[j + 1] in _TENS): pass
            elif t == ',' and j and toks[j - 1] in ('thousand', 'million', 'billion') and j + 1 < len(toks) \
                    and (toks[j + 1] in _UNITS or toks[j + 1] in _TENS): pass      # "one thousand, one hundred"
            else: break
            words += 1; j += 1
        val = str(total + cur)
        if j < len(toks) and toks[j] == 'point' and j + 1 < len(toks) and (toks[j + 1] in _UNITS or toks[j + 1] == 'oh'):
            d = ''; j += 1
            while j < len(toks) and (toks[j] == 'oh' or toks[j] in _UNITS and _UNITS[toks[j]] < 10): d += str(_UNITS.get(toks[j], 0)); j += 1
            val = (val + '.' + d).rstrip('0').rstrip('.'); words += 2
        if not (words == 1 and toks[i] in ('one', 'zero')):
            out.append(val)
        i = max(j, i + 1)
    return out

def string_literals(js):
    js = re.sub(r'//[^\n]*', '', js)
    lits = re.findall(r"'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|\"((?:[^\"\\\n]|\\.)*)\"", js)
    for parts in lits:
        s = next(p for p in parts if p is not None) if any(parts) else ''
        s = re.sub(r'\$\{[^}]*\}', ' ', s)
        if not re.search(r'\d', s) or not re.search(r'[A-Za-z\uac00-\ud7a3%×≈]', s): continue
        if re.search(r'[;{}]', s): continue  # shader / code strings
        if re.match(r'^\s*(#|rgba?\(|hsla?\(|/|\.|[\d.]+\s*(px|em|%)?\s*$)', s) or 'px ' in s or 'http' in s: continue
        yield s

def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    job = sys.argv[1]; J = os.path.join(JOBS, job)
    paper_raw = open(os.path.join(J, 'paper', 'paper.txt'), encoding='utf-8').read()
    paper = norm(paper_raw)
    lines = [norm(l) for l in paper_raw.splitlines()]
    C = json.load(open(os.path.join(J, 'claims.json'), encoding='utf-8'))
    script = json.load(open(os.path.join(J, 'script.json'), encoding='utf-8'))
    claims = C.get('claims', [])
    sent_keys = {f"{s['id']}.{k}" for s in script['scenes'] for k in range(len(s['s']))}
    rows = []  # (status, id, detail)
    seen_ids = set()
    for i, c in enumerate(claims):
        if not c.get('id'): rows.append(('FAIL', f'#{i}', 'claim has no id')); c['id'] = f'#{i}'
        elif c['id'] in seen_ids: rows.append(('FAIL', c['id'], 'duplicate claim id'))
        seen_ids.add(c['id'])
    ids = {c['id'] for c in claims}
    for c in claims:
        k, cid = c.get('kind'), c.get('id')
        bad_refs = [u for u in c.get('used_in', []) if u not in sent_keys]
        if bad_refs: rows.append(('WARN', cid, f'used_in refers to unknown sentence(s) {bad_refs}'))
        if k == 'quote':
            q = norm(c.get('quote', ''))
            if len(q) < 8: rows.append(('FAIL', cid, 'quote missing or too short to verify')); continue
            ok = q in paper
            rows.append(('PASS' if ok else 'FAIL', cid, 'quote found' if ok else f'quote NOT found: "{c.get("quote", "")[:90]}"'))
        elif k == 'table':
            cap = norm(c.get('table', ''))
            if not any(cap + sep in paper for sep in (':', '. ')):  # "Table 2:" (most styles) or "Table 2." (CVPR)
                rows.append(('FAIL', cid, f'caption "{c.get("table")}" not found')); continue
            row, vals = norm(c.get('row', '')), [norm(str(v)) for v in c.get('values', [])]
            if not row or not vals or not cap:
                rows.append(('FAIL', cid, 'table claim needs table, row and values')); continue
            # search only the cited table: between the previous and the next table caption around it
            # (captions sit above or below their table depending on the template)
            # every caption line (Arabic or Roman numbering, any repeat such as a list of tables) is a boundary;
            # each occurrence of the cited caption gets its own scope and any of them may hold the row
            bounds = [i for i, l in enumerate(lines) if re.match(r'table [0-9ivxlc]+\s*[:.]', l)]
            capl = [i for i, l in enumerate(lines) if l.startswith(cap + ':') or l.startswith(cap + '.')]
            scopes = []
            for c0 in capl:
                lo = max([i for i in bounds if i < c0], default=-1) + 1
                hi = min([i for i in bounds if i > c0], default=len(lines))
                scopes.append(lines[lo:hi])
            scope = [l for sc in scopes for l in sc] if scopes else lines
            # a value must stand alone: "60" must not match inside "60.9" or "160"
            hit = [l for l in scope if row in l and all(re.search(r'(?<![\d.])' + re.escape(v) + r'(?![\d]|\.\d)', l) for v in vals)]
            rows.append(('PASS' if hit else 'FAIL', cid, f'{c.get("table")} row "{c.get("row")}" = {c.get("values")}' + ('' if hit else '  NOT matched on one line')))
        elif k == 'derived':
            miss = [f for f in ('from', 'derivation', 'on_screen_label') if not c.get(f)]
            unk = [f for f in c.get('from', []) if f not in ids]
            st = 'WARN' if (miss or unk) else 'REVIEW'
            rows.append((st, cid, f'derived: {c.get("derivation", "")[:80]}' + (f'  missing {miss}' if miss else '') + (f'  unknown ids {unk}' if unk else '')))
        elif k == 'opinion':
            rows.append(('REVIEW' if c.get('on_screen_label') else 'WARN', cid, 'opinion' + ('' if c.get('on_screen_label') else ': not labeled on screen')))
        else:
            rows.append(('FAIL', cid, f'unknown kind {k}'))
    # coverage
    allowed = set()
    for k in C.get('allow_numbers', {}):
        allowed.update(nums(k) or [k])
    covered = set(allowed)
    failed = {r[1] for r in rows if r[0] == 'FAIL'}   # a failed claim cannot vouch for a number
    for c in claims:
        if c['id'] in failed: continue
        for v in c.get('values', []): covered.update(nums(str(v)))
        for f in ('quote', 'text', 'row', 'derivation', 'table'): covered.update(nums(c.get(f, '')))
    # numbers each sentence's own claims vouch for (claims list the sentences they back in `used_in`)
    by_sent = {}
    for c in claims:
        if c['id'] in failed: continue
        ns = set()
        for v in c.get('values', []): ns.update(nums(str(v)))
        for f in ('quote', 'text', 'row', 'derivation', 'table'): ns.update(nums(c.get(f, '')))
        for u in c.get('used_in', []): by_sent.setdefault(u, set()).update(ns)
    shown = []
    for s in script['scenes']:
        for kk, (sub, tts) in enumerate(s['s']):
            key = f'{s["id"]}.{kk}'
            shown += [(n, f'{key} subtitle') for n in nums(sub)]
            spoken = nums(tts) + spoken_numbers(tts)
            shown += [(n, f'{key} narration') for n in spoken]
            for n in sorted(set(nums(sub)) | set(spoken)):
                small = re.fullmatch(r'\d', n) or n == '10'   # small counts ("four views", "two stages") need no used_in link
                if n in covered and n not in allowed and not small and n not in by_sent.get(key, set()):
                    rows.append(('WARN', key, f'{n} is covered by a claim, but not by one whose used_in lists {key} (is it the same quantity?)'))

    onscreen = os.path.join(J, 'build', 'onscreen.json')
    if os.path.exists(onscreen):
        newest = max(os.path.getmtime(os.path.join(J, f)) for f in os.listdir(J) if f.endswith('.js') or f == 'script.json')
        if os.path.getmtime(onscreen) < newest:
            rows.append(('WARN', 'onscreen', 'build/onscreen.json is older than script.json/scenes: run `p2v preview` (or render) again'))
        for it in json.load(open(onscreen, encoding='utf-8')).get('items', []):
            shown += [(n, f'on screen ({it.get("scene")}): "{it.get("text", "")[:50]}"') for n in nums(it.get('text', ''))]
    elif any(f.endswith('.js') for f in os.listdir(J)):
        rows.append(('INFO', 'onscreen', 'no build/onscreen.json yet: numbers drawn from JS values are checked after `p2v preview`'))
    for f in sorted(os.listdir(J)):
        if f.endswith('.js'):
            for lit in string_literals(open(os.path.join(J, f), encoding='utf-8').read()):
                shown += [(n, f'{f}: "{lit.strip()[:50]}"') for n in nums(lit)]
    unc = {}
    for n, where in shown:
        if n not in covered: unc.setdefault(n, []).append(where)
    for n, w in sorted(unc.items(), key=lambda x: x[0]):
        rows.append(('WARN', f'num {n}', f'not covered by any claim; shown at {w[:3]}' + (' …' if len(w) > 3 else '')))
    n_fail = sum(r[0] == 'FAIL' for r in rows); n_warn = sum(r[0] == 'WARN' for r in rows)
    os.makedirs(os.path.join(J, 'build'), exist_ok=True)
    with open(os.path.join(J, 'build', 'VERIFY_auto.md'), 'w', encoding='utf-8') as f:
        f.write(f'# Mechanical cross-check: {job}\n\nFAIL {n_fail} · WARN {n_warn} · claims {len(claims)}\n\n| status | id | detail |\n|---|---|---|\n')
        for r in rows: f.write(f'| {r[0]} | {r[1]} | {r[2].replace("|", "/")} |\n')
    for r in rows:
        if r[0] != 'PASS': print(f'{r[0]:6} {r[1]:10} {r[2]}')
    print(f'\nFAIL {n_fail}  WARN {n_warn}  PASS {sum(r[0] == "PASS" for r in rows)}  -> {os.path.join(J, "build", "VERIFY_auto.md")}')
    sys.exit(1 if n_fail else 0)

if __name__ == '__main__':
    main()
