#!/usr/bin/env python3
"""Decodes the Bharati encoder's output (backend/test/bharati-roundtrip.ts) back to
Unicode and compares it with the input: every 8 August span and every word of
a day's stories must come back as the same text. Latin digits count as equal
to Gujarati ones (the Gopika font draws ASCII digits as Gujarati digits).
"""
import sys,json
sys.path.insert(0,'scripts/replica')
from bharati_decode import decode
d=json.load(open(sys.argv[1]))
sp=d['spans']; print('8 Aug spans:', sum(decode(x['text'])[0]==x['uni'] for x in sp), '/', len(sp), 'round-trip;', sum(x['text']==x['legacy'] for x in sp),'byte-identical')
w=d['words']
def norm(u): return u.translate(str.maketrans('0123456789','૦૧૨૩૪૫૬૭૮૯')).replace("'",'’').replace('ઃ',':').replace('‘','’')
good=lambda x: decode(x['text'])[0]==x['uni'] or norm(decode(x['text'])[0])==norm(x['uni'])
print('today words:', sum(map(good,w)),'/',len(w),'round-trip (Latin digits shown as Gujarati digits counted as equal)')
for x in w:
  if x['unknown'] or not good(x): print('  ', x['uni'], x['unknown'], decode(x['text'])[0])
