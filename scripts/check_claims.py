#!/usr/bin/env python3
"""Mechanical cross-check (layer 1 of references/verification.md).

    python3 scripts/check_claims.py <job>

Checks jobs/<job>/claims.json against paper/paper.txt and the script/scenes:
  * kind=quote   the quote appears verbatim (whitespace/hyphenation-insensitive) in the paper text
  * kind=table   a table line contains the row label and every listed value; the table caption exists
  * kind=derived needs `from` (existing claim ids), `derivation`, and `on_screen_label`
  * kind=opinion needs `on_screen_label` (how the video marks it as interpretation)
  * coverage     every number shown in subtitles or on-screen strings is covered by some claim
                 (values / quote / text) or by `allow_numbers` with a reason
Writes build/VERIFY_auto.md. Exit code 1 if anything FAILs. WARNs go to the verifier for judgment.
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS = os.path.abspath(os.path.expanduser(os.environ.get('P2V_JOBS') or os.path.join(ROOT, 'jobs')))

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('\u2212', '-').replace('\u2013', '-').replace('\u2014', '-').replace('\u00ad', '')
    s = re.sub(r'-\s*\n\s*', '', s)            # de-hyphenate line breaks
    s = re.sub(r'\s+', ' ', s)
    return s.lower().strip()

NUM = re.compile(r'(?<![\w.])\d+(?:[.,]\d+)*')
def nums(s):
    out = []
    for m in NUM.finditer(s):
        v = m.group(0)
        v = v.replace(',', '') if re.fullmatch(r'\d{1,3}(,\d{3})+', v) else v
        out.append(v.rstrip('.'))
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
    claims = C.get('claims', []); ids = {c['id'] for c in claims}
    sent_keys = {f"{s['id']}.{k}" for s in script['scenes'] for k in range(len(s['s']))}
    rows = []  # (status, id, detail)
    for c in claims:
        k, cid = c.get('kind'), c.get('id')
        bad_refs = [u for u in c.get('used_in', []) if u not in sent_keys]
        if bad_refs: rows.append(('WARN', cid, f'used_in refers to unknown sentence(s) {bad_refs}'))
        if k == 'quote':
            ok = norm(c.get('quote', '')) in paper
            rows.append(('PASS' if ok else 'FAIL', cid, 'quote found' if ok else f'quote NOT found: "{c.get("quote", "")[:90]}"'))
        elif k == 'table':
            cap = norm(c.get('table', ''))
            if not any(cap + sep in paper for sep in (':', '. ')):  # "Table 2:" (most styles) or "Table 2." (CVPR)
                rows.append(('FAIL', cid, f'caption "{c.get("table")}" not found')); continue
            row, vals = norm(c.get('row', '')), [norm(v) for v in c.get('values', [])]
            hit = [l for l in lines if row in l and all(re.search(r'(?<![\d.])' + re.escape(v) + r'(?![\d])', l) for v in vals)]
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
    covered = set(C.get('allow_numbers', {}).keys())
    for c in claims:
        for f in ('values',): covered.update(norm(v) for v in c.get(f, []))
        for f in ('quote', 'text', 'row', 'derivation', 'table'): covered.update(nums(c.get(f, '')))
    shown = []
    for s in script['scenes']:
        for kk, (sub, _) in enumerate(s['s']): shown += [(n, f'{s["id"]}.{kk} subtitle') for n in nums(sub)]
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
    with open(os.path.join(J, 'build', 'VERIFY_auto.md'), 'w') as f:
        f.write(f'# Mechanical cross-check: {job}\n\nFAIL {n_fail} · WARN {n_warn} · claims {len(claims)}\n\n| status | id | detail |\n|---|---|---|\n')
        for r in rows: f.write(f'| {r[0]} | {r[1]} | {r[2].replace("|", "/")} |\n')
    for r in rows:
        if r[0] != 'PASS': print(f'{r[0]:6} {r[1]:10} {r[2]}')
    print(f'\nFAIL {n_fail}  WARN {n_warn}  PASS {sum(r[0] == "PASS" for r in rows)}  -> jobs/{job}/build/VERIFY_auto.md')
    sys.exit(1 if n_fail else 0)

if __name__ == '__main__':
    main()
