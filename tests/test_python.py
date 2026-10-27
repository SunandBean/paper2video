#!/usr/bin/env python3
"""Regression tests for the Python side (standard library only; no tools needed).

    python3 tests/test_python.py        (or: ./p2v test)
"""
import json, os, shutil, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from check_claims import nums, spoken_numbers  # noqa: E402
from fetch_paper import parse_id  # noqa: E402

P2V = os.path.join(ROOT, 'p2v')


def make_job(base, name, paper, scenes, claims, allow=None, js=None, onscreen=None):
    J = os.path.join(base, name)
    os.makedirs(os.path.join(J, 'paper'))
    with open(os.path.join(J, 'paper', 'paper.txt'), 'w', encoding='utf-8') as f: f.write('=== page 1 ===\n' + paper)
    with open(os.path.join(J, 'script.json'), 'w', encoding='utf-8') as f: json.dump({'scenes': scenes}, f)
    with open(os.path.join(J, 'claims.json'), 'w', encoding='utf-8') as f: json.dump({'claims': claims, 'allow_numbers': allow or {}}, f)
    if js is not None:
        with open(os.path.join(J, 'scenes.js'), 'w', encoding='utf-8') as f: f.write(js)
    if onscreen is not None:
        os.makedirs(os.path.join(J, 'build'), exist_ok=True)
        with open(os.path.join(J, 'build', 'onscreen.json'), 'w', encoding='utf-8') as f: json.dump({'items': onscreen}, f)
    return J


def check(base, name):
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'check_claims.py'), name],
                       env={**{k: v for k, v in os.environ.items() if not k.startswith('P2V_')}, 'P2V_JOBS': base},
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


QUOTE = {'id': 'c1', 'kind': 'quote', 'text': 'accuracy 60.9', 'quote': 'Our method reaches 60.9 accuracy', 'used_in': ['a.0']}
PAPER = ('Our method reaches 60.9 accuracy. The dataset has 42 scenes.\nTable 2: Main results.\nOurs     60.9    41.2\n'
         'Table 5: Other results.\nBaseline   77.7\n')


class Numbers(unittest.TestCase):
    def test_tokens(self):
        cases = {
            '-3 and 3': ['-3', '3'], '1e-3': ['1e-3'], '10^3': ['10^3'], '10^{-4}': ['10^-4'],
            '2-3 range': ['2', '3'], '(\u22128.5%)': ['-8.5'], '+10.07 points': ['10.07'],
            '142센티미터': ['142'], '1,000 and 1,2': ['1000', '1,2'], 'v2 3D 60.9.': ['60.9'], '67.0%': ['67'], '1-D slice': [], '0.50': ['0.5'], '1.000': ['1.000'], '10.0x': ['10'],
            '\u2460 Intro \u246a Limits': [],
        }
        for s, want in cases.items():
            self.assertEqual(nums(s), want, s)


    def test_spoken(self):
        cases = {'sixty point nine': ['60.9'], 'forty-seven percent': ['47'], 'two hundred and twelve': ['212'],
                 'one model': [], 'measure-zero set': [], 'three, one-hundred-eighty degree': ['3', '180'],
                 'twenty twenty six': ['2026'], 'nineteen ninety': ['1990'], 'zero point four two': ['0.42'],
                 'point five': ['0.5'], 'one hundred and one': ['101'], 'a thousand': ['1000'],
                 'three hundred thousand': ['300000'], 'two point zero five': ['2.05'], 'one of the two': ['2'],
                 'twelve three': ['12', '3'], 'forty five': ['45']}
        for s, want in cases.items():
            self.assertEqual(spoken_numbers(s), want, s)


class ArxivIds(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_id('https://arxiv.org/abs/2610.35607v2?context=cs'), ('2610.35607', 'v2', '2610.35607'))
        self.assertEqual(parse_id('arXiv:2609.30404'), ('2609.30404', '', '2609.30404'))
        self.assertEqual(parse_id('hep-th/9901001')[2], 'hep-th_9901001')
        self.assertEqual(parse_id('https://arxiv.org/pdf/math.GT/0309136v1')[2], 'math.GT_0309136')
        self.assertIsNone(parse_id('12610.303401'))
        self.assertIsNone(parse_id('hello'))


class Checker(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix='p2vtest-')

    def tearDown(self):
        shutil.rmtree(self.base, ignore_errors=True)

    def run_job(self, **kw):
        make_job(self.base, 'j', kw.pop('paper', PAPER), kw.pop('scenes'), kw.pop('claims', [QUOTE]), **kw)
        return check(self.base, 'j')

    def test_clean_job_passes(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 60.9.', 'It reaches 60.9.']]}])
        self.assertEqual(code, 0, out); self.assertIn('FAIL 0  WARN 0', out)

    def test_unsourced_subtitle_number(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 70.1.', 'It reaches 70.1.']]}])
        self.assertIn('num 70.1', out)

    def test_narration_number(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 60.9.', 'It reaches 61.9.']]}])
        self.assertIn('num 61.9', out)

    def test_sign_matters(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It drops -60.9.', 'x']]}])
        self.assertIn('num -60.9', out)

    def test_onscreen_number(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['ok', 'ok']]}], js='export default {};',
                                 onscreen=[{'text': 'Ours 99.5', 'scene': 'a'}])
        self.assertIn('num 99.5', out)

    def test_empty_quote_fails(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['ok', 'ok']]}],
                                 claims=[{'id': 'c1', 'kind': 'quote', 'text': 'x', 'quote': ''}])
        self.assertEqual(code, 1); self.assertIn('too short', out)

    def test_table_value_must_stand_alone(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['ok', 'ok']]}],
                                 claims=[{'id': 'c1', 'kind': 'table', 'text': 'x', 'table': 'Table 2', 'row': 'Ours', 'values': ['60']}])
        self.assertEqual(code, 1)

    def test_failed_claim_does_not_cover(self):
        bad = {'id': 'c2', 'kind': 'quote', 'text': 'speed 70', 'quote': 'this sentence is not in the paper'}
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['70 times faster', 'x']]}], claims=[QUOTE, bad])
        self.assertIn('num 70', out)

    def test_spoken_number_checked(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 60.9.', 'It reaches sixty one point nine.']]}])
        self.assertIn('num 61.9', out)

    def test_spoken_number_matches_digits(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 60.9.', 'It reaches sixty point nine.']]}])
        self.assertIn('FAIL 0  WARN 0', out)

    def test_number_must_belong_to_sentence_claim(self):
        other = {'id': 'c2', 'kind': 'quote', 'text': '42 scenes', 'quote': 'The dataset has 42 scenes', 'used_in': ['a.0']}
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['It reaches 60.9.', 'x'], ['Accuracy is 42% higher.', 'x']]}],
                                 claims=[QUOTE, other])
        self.assertIn('not by one whose used_in lists a.1', out)

    def test_table_value_from_other_table_fails(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['ok', 'ok']]}],
                                 claims=[{'id': 'c1', 'kind': 'table', 'text': 'x', 'table': 'Table 2', 'row': 'Baseline', 'values': ['77.7']}])
        self.assertEqual(code, 1, out)

    def test_roman_caption_scope(self):
        paper = 'TABLE I: First.\nOurs 11.1\nTABLE II: Second.\nBaseline 22.2\n'
        code, out = self.run_job(paper=paper, scenes=[{'id': 'a', 's': [['ok', 'ok']]}],
                                 claims=[{'id': 'c1', 'kind': 'table', 'text': 'x', 'table': 'TABLE I', 'row': 'Baseline', 'values': ['22.2']}])
        self.assertEqual(code, 1, out)

    def test_duplicate_ids_fail(self):
        code, out = self.run_job(scenes=[{'id': 'a', 's': [['ok', 'ok']]}], claims=[QUOTE, dict(QUOTE)])
        self.assertIn('duplicate claim id', out)


class Paths(unittest.TestCase):
    def paths(self, root_link, home, **env):
        r = subprocess.run([sys.executable, os.path.join(root_link, 'scripts', 'p2v_paths.py')],
                           env={**{k: v for k, v in os.environ.items() if not k.startswith('P2V_')}, 'HOME': home, **env},
                           capture_output=True, text=True)
        return dict(l.split(None, 1) for l in r.stdout.strip().splitlines())

    def test_layouts(self):
        home = tempfile.mkdtemp(prefix='p2vhome-')
        try:
            cache = os.path.join(home, '.claude', 'plugins', 'cache', 'mkt', 'paper2video', 'abc123')
            skills = os.path.join(home, '.claude', 'skills', 'paper2video')
            for d in (cache, skills):
                os.makedirs(os.path.join(d, 'scripts'))
                shutil.copy(os.path.join(ROOT, 'scripts', 'p2v_paths.py'), os.path.join(d, 'scripts'))
            p = self.paths(cache, home)
            self.assertEqual(p['P2V_TOOLS'], os.path.join(home, '.claude', 'plugins', 'data', 'paper2video-mkt'))
            self.assertEqual(p['P2V_JOBS'], os.path.join(home, 'paper2video', 'jobs'))
            p = self.paths(skills, home)
            self.assertEqual(p['P2V_TOOLS'], os.path.join(skills, '.tools'))
            self.assertEqual(p['P2V_OUT'], os.path.join(home, 'paper2video', 'videos'))
            p = self.paths(skills, home, P2V_HOME='/tmp/x y')
            self.assertEqual(p['P2V_JOBS'], '/tmp/x y/jobs')
        finally:
            shutil.rmtree(home, ignore_errors=True)


class Cli(unittest.TestCase):
    def p2v(self, *args):
        env = {k: v for k, v in os.environ.items() if not k.startswith('P2V_')}
        r = subprocess.run([P2V, *args], capture_output=True, text=True, env=env)
        return r.returncode, r.stdout + r.stderr

    def test_rejects_bad_job_ids(self):
        for bad in ('../scripts', 'a b', '.hidden', ''):
            code, out = self.p2v('check', bad)
            self.assertEqual(code, 2, (bad, out))

    def test_missing_job(self):
        code, out = self.p2v('check', 'no-such-job-xyz')
        self.assertIn(code, (2, 3), out)

    def test_unknown_command(self):
        self.assertEqual(self.p2v('bogus')[0], 2)


if __name__ == '__main__':
    unittest.main(verbosity=1)
