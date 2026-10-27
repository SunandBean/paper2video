#!/usr/bin/env python3
"""Fetch an arXiv paper into a job folder and record its license.

    python3 scripts/fetch_paper.py <arxiv id or link>   e.g. 2610.30340 or https://arxiv.org/pdf/2610.30340

Creates jobs/<id>/ (from templates if new) and writes
    paper/meta.json   title, authors, abs/pdf URLs, license URL + short name, fetch time
    paper/paper.pdf
    paper/paper.txt   text with '=== page N ===' markers (pdftotext -layout, else pypdf)
Respects the arXiv API terms: at most one request every 3 seconds.
"""
import json, os, re, shutil, subprocess, sys, time, html, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p2v_paths import ROOT, JOBS  # noqa: E402
UA = {'User-Agent': 'paper2video/0.1 (personal research explainer)'}

LICENSES = {
    'creativecommons.org/licenses/by/4.0': 'CC BY 4.0',
    'creativecommons.org/licenses/by-sa/4.0': 'CC BY-SA 4.0',
    'creativecommons.org/licenses/by-nc-sa/4.0': 'CC BY-NC-SA 4.0',
    'creativecommons.org/licenses/by-nc-nd/4.0': 'CC BY-NC-ND 4.0',
    'creativecommons.org/publicdomain/zero/1.0': 'CC0 1.0',
    'arxiv.org/licenses/nonexclusive-distrib/1.0': 'arXiv non-exclusive (no reuse grant)',
}
FIGURE_REUSE = {
    'CC BY 4.0': 'allowed with attribution (note changes)',
    'CC BY-SA 4.0': 'allowed with attribution; derivatives must be CC BY-SA',
    'CC BY-NC-SA 4.0': 'non-commercial only: avoid if the video earns money',
    'CC BY-NC-ND 4.0': 'non-commercial, no modification: avoid',
    'CC0 1.0': 'allowed',
    'arXiv non-exclusive (no reuse grant)': 'NOT allowed without author permission: draw your own visuals',
}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    m = re.search(r'(\d{4}\.\d{4,5})(v\d+)?', sys.argv[1])
    if not m: sys.exit(f'not an arXiv id or link: {sys.argv[1]}')
    aid = m.group(1)   # accepts 2610.35607, arXiv:2610.35607v2, https://arxiv.org/{abs,pdf,html}/2610.35607
    J = os.path.join(JOBS, aid); P = os.path.join(J, 'paper'); os.makedirs(P, exist_ok=True)
    tpl = os.path.join(ROOT, 'templates', 'job')
    for f in os.listdir(tpl):
        if not os.path.exists(os.path.join(J, f)):
            shutil.copy(os.path.join(tpl, f), os.path.join(J, f))
    abs_url = f'https://arxiv.org/abs/{aid}'
    page = get(abs_url).decode('utf-8', 'replace')
    meta_tag = lambda n: [html.unescape(m) for m in re.findall(rf'<meta name="{n}" content="([^"]*)"', page)]
    lic_url = next(iter(re.findall(r'href="((?:https?:)?//[^"]*licenses?/[^"]*)"', page)), '')
    lic_name = next((v for k, v in LICENSES.items() if k in lic_url), 'UNKNOWN: check the abs page')
    meta = {
        'id': aid, 'title': (meta_tag('citation_title') or [''])[0], 'authors': meta_tag('citation_author'),
        'date': (meta_tag('citation_date') or [''])[0], 'abs_url': abs_url, 'pdf_url': f'https://arxiv.org/pdf/{aid}',
        'license_url': lic_url, 'license': lic_name, 'figure_reuse': FIGURE_REUSE.get(lic_name, 'unknown: treat as not allowed'),
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }
    time.sleep(3)
    pdf = get(meta['pdf_url'])
    open(os.path.join(P, 'paper.pdf'), 'wb').write(pdf)
    txt = None
    if shutil.which('pdftotext'):
        r = subprocess.run(['pdftotext', '-layout', os.path.join(P, 'paper.pdf'), '-'], capture_output=True)
        if r.returncode == 0: txt = r.stdout.decode('utf-8', 'replace').split('\f')
    if txt is None:
        from pypdf import PdfReader
        txt = [pg.extract_text() or '' for pg in PdfReader(os.path.join(P, 'paper.pdf')).pages]
    with open(os.path.join(P, 'paper.txt'), 'w') as f:
        for i, t in enumerate(txt):
            if t.strip(): f.write(f'\n=== page {i + 1} ===\n{t}')
    json.dump(meta, open(os.path.join(P, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: meta[k] for k in ('id', 'title', 'license', 'figure_reuse')}, ensure_ascii=False, indent=1))
    print(f'pages: {len(txt)}  pdf: {len(pdf) / 1e6:.1f} MB  -> {P}')

if __name__ == '__main__':
    main()
