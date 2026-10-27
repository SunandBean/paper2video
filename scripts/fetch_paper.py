#!/usr/bin/env python3
"""Fetch an arXiv paper into a job folder and record its license.

    ./p2v fetch <arxiv id or link>   e.g. 2610.30340, arXiv:2610.30340v2, https://arxiv.org/pdf/2610.30340, hep-th/9901001
    python3 scripts/fetch_paper.py --id <link>   print the job id only

Creates <jobs>/<id>/ (from templates if new; old-style ids use '_' for '/', e.g. hep-th_9901001) and writes
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
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except Exception as e:  # HTTPError (404: no such paper), URLError (offline), timeout
        sys.exit(f'download failed: {url}: {e}')

def parse_id(s):
    """(arxiv_id, version, job_id) from an id or link, or None."""
    m = re.search(r'(?<![\d.])(\d{4}\.\d{4,5})(v\d+)?(?![\d])', s)                 # 2610.35607, 2610.35607v2
    if not m: m = re.search(r'\b([a-z][a-z-]*(?:\.[A-Z]{2})?/\d{7})(v\d+)?(?![\d])', s)  # hep-th/9901001, math.GT/0309136
    if not m: return None
    return m.group(1), m.group(2) or '', m.group(1).replace('/', '_')

def license_url(page):
    for pat in (r'<a href="([^"]+)"[^>]*class="has_license"', r'<a href="([^"]+)"[^>]*title="Rights to this article"',
                r'href="((?:https?:)?//(?:creativecommons\.org|arxiv\.org/licenses)/[^"]*)"'):
        m = re.search(pat, page)
        if m: return m.group(1)
    return ''

def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[1] == '--id':
        r = parse_id(sys.argv[2] if len(sys.argv) > 2 else '')
        print(r[2] if r else ''); sys.exit(0 if r else 1)
    r = parse_id(sys.argv[1])
    if not r: sys.exit(f'not an arXiv id or link: {sys.argv[1]}')
    aid, ver, job = r
    J = os.path.join(JOBS, job); P = os.path.join(J, 'paper')
    abs_url = f'https://arxiv.org/abs/{aid}{ver}'   # a pinned version (v2) stays pinned; otherwise the latest
    page = get(abs_url).decode('utf-8', 'replace')
    meta_tag = lambda n: [html.unescape(m) for m in re.findall(rf'<meta name="{n}" content="([^"]*)"', page)]
    lic_url = license_url(page)
    lic_name = next((v for k, v in LICENSES.items() if k in lic_url),
                    'UNKNOWN: check the abs page' if lic_url else 'none listed (older arXiv papers: default terms, no reuse grant)')
    meta = {
        'id': aid, 'version': ver or 'latest', 'job': job, 'title': (meta_tag('citation_title') or [''])[0], 'authors': meta_tag('citation_author'),
        'date': (meta_tag('citation_date') or [''])[0], 'abs_url': abs_url, 'pdf_url': f'https://arxiv.org/pdf/{aid}{ver}',
        'license_url': lic_url, 'license': lic_name, 'figure_reuse': FIGURE_REUSE.get(lic_name, 'unknown: treat as not allowed'),
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }
    time.sleep(3)
    if not meta['title']: sys.exit(f'{abs_url} has no paper metadata (wrong id?)')
    pdf = get(meta['pdf_url'])
    if not pdf.startswith(b'%PDF'): sys.exit(f'{meta["pdf_url"]} did not return a PDF (rate limit or withdrawn paper?)')
    os.makedirs(P, exist_ok=True)   # only now: a failed download leaves no half-made job behind
    tpl = os.path.join(ROOT, 'templates', 'job')
    for f in os.listdir(tpl):
        if not os.path.exists(os.path.join(J, f)):
            shutil.copy(os.path.join(tpl, f), os.path.join(J, f))
    with open(os.path.join(P, 'paper.pdf'), 'wb') as f: f.write(pdf)
    txt = None
    if shutil.which('pdftotext'):
        r = subprocess.run(['pdftotext', '-layout', os.path.join(P, 'paper.pdf'), '-'], capture_output=True)
        if r.returncode == 0: txt = r.stdout.decode('utf-8', 'replace').split('\f')
    if txt is None:
        from pypdf import PdfReader
        txt = [pg.extract_text() or '' for pg in PdfReader(os.path.join(P, 'paper.pdf')).pages]
    if sum(len(t.strip()) for t in txt) < 2000:
        print('WARNING: almost no text extracted (scanned PDF without a text layer?). Claims cannot be checked.', file=sys.stderr)
    with open(os.path.join(P, 'paper.txt'), 'w', encoding='utf-8') as f:
        for i, t in enumerate(txt):
            if t.strip(): f.write(f'\n=== page {i + 1} ===\n{t}')
    with open(os.path.join(P, 'meta.json'), 'w', encoding='utf-8') as f: json.dump(meta, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: meta[k] for k in ('id', 'title', 'license', 'figure_reuse')}, ensure_ascii=False, indent=1))
    print(f'pages: {len(txt)}  pdf: {len(pdf) / 1e6:.1f} MB  -> {P}')

if __name__ == '__main__':
    main()
