#!/usr/bin/env python3
"""Fuzz check_claims.spoken_numbers against num2words (an independent number-to-words library).
    pip install num2words && python3 tests/fuzz_spoken.py [seed]
Integers 2..2000 exhaustively plus 5000 random up to 10^9 (with and without "and"/commas), 5000 decimals, years
1901-2099, and numbers inside sentences. Expected output: failures: 0
"""
import os, sys, random
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))
from check_claims import spoken_numbers
try:
    from num2words import num2words
except ImportError:
    sys.exit('needs num2words: pip install num2words')
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
fails=[]
def chk(spoken, want, ctx):
    got = spoken_numbers(spoken)
    if got != [want]: fails.append((ctx, spoken, want, got))
for n in list(range(2, 2001)) + [random.randint(2001, 10**9) for _ in range(5000)]:
    chk(num2words(n), str(n), 'int'); chk(num2words(n).replace(' and ', ' ').replace(',', ''), str(n), 'int-plain')
for _ in range(5000):
    n = round(random.uniform(0, 1000), random.choice([1, 2, 3])); s = f'{n}'
    if s.endswith('.0'): continue
    ip, dp = s.split('.')
    chk(num2words(int(ip)) + ' point ' + ' '.join(num2words(int(d)) for d in dp), s.rstrip('0').rstrip('.'), 'dec')
for y in range(1901, 2100):
    if y % 100: chk(num2words(y, to='year'), str(y), 'year')
for n in [12, 47, 60, 101, 212, 1990, 3500, 1100]:
    for tmpl in ['about {}, roughly', 'from {} to five', '{} percent of runs', 'the {}-step schedule', '{}. Next']:
        sp = tmpl.format(num2words(n)); got = spoken_numbers(sp)
        if str(n) not in got: fails.append(('ctx', sp, str(n), got))
from collections import Counter
print('failures:', len(fails), Counter(f[0] for f in fails))
for f in fails[:20]: print(f)
sys.exit(1 if fails else 0)
