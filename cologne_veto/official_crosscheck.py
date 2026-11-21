"""Compare public Reloader veto labels with dated threads, and played maps with BLAST."""
import argparse
import json
import re
from collections import Counter
from html import unescape
from pathlib import Path

from official_blast import HERE, MAPS

ALIASES = {'teamspirit':'spirit','betboomteam':'betboom','g2esports':'g2','futesports':'fut',
           'painteam':'pain','paingaming':'pain','b8esports':'b8','lgcy':'legacy','9zteam':'9z',
           'bb':'betboom','teamlegacy':'legacy'}

# Direct HTML was unavailable for this one match during collection. The publicly
# indexed copy of the same Reloader page exposed all seven actions.
INDEXED = {
    2394865: [
        ('BetBoom Team','ban','Ancient'), ('BetBoom Team','ban','Overpass'),
        ('Team Spirit','ban','Nuke'), ('Team Spirit','ban','Anubis'),
        ('Team Spirit','ban','Inferno'), ('BetBoom Team','ban','Dust2'),
        (None,'left','Mirage'),
    ],
}


def team(name):
    if name is None:
        return None
    value = re.sub(r'[^a-z0-9]', '', name.casefold())
    return ALIASES.get(value, value)


def check(cache):
    ledger = {r['hltvId']:r for r in json.loads((HERE/'ledger.json').read_text(encoding='utf8'))['matches']}
    blast = json.loads((HERE/'official-blast.json').read_text(encoding='utf8'))['matches']
    by_pair = {(frozenset((team(r['a']),team(r['b']))), r['day']):r for r in blast}
    facts = []
    index = (cache/'reloader-index.html').read_text(encoding='utf8')
    links = sorted(set(re.findall(r'href="(/esports/cs2/match/[a-z0-9-]+-iem-cologne-2026-2026-06-0[6-9])"', index)))
    assert len(links) == len(ledger) == len(by_pair) == 33
    for link in links:
        slug = link.rsplit('/', 1)[1]
        day = slug[-10:]
        sides = frozenset(team(p) for p in slug.split('-iem-cologne-')[0].split('-vs-'))
        r = by_pair[(sides, day)]
        mid = r['stage2Id']
        current = ledger[mid]
        page = cache / ('r-' + slug + '.html')
        text = page.read_text(encoding='utf8') if page.exists() else ''
        block = re.search(r'<h2>Map veto</h2><div class="es-veto">(.*?)</div>', text)
        source_steps = []
        retrieval = 'html' if block else 'unavailable'
        if block:
            for who, verb, mp in re.findall(r'<span [^>]+>([^<]+?) (banned|picked) <b>([^<]+)</b></span>',block[1]):
                code = 'left' if who == 'decider' else {'banned':'ban','picked':'pick'}[verb]
                source_steps.append(dict(team=None if code=='left' else unescape(who),action=code,map=MAPS[mp.lower()]))
        elif mid in INDEXED:
            source_steps = [dict(team=who,action=verb,map=mp) for who,verb,mp in INDEXED[mid]]
            retrieval = 'indexed-page'
        assert len(source_steps) in (0,7)
        actions = current['actions']
        assert [v['map'] for v in actions if v['action'] in ('pick','left')][:len(r['maps'])] == [g[0] for g in r['maps']]
        assert frozenset((team(current['a']),team(current['b']))) == sides and r['day'] == current['day']
        differences = []
        for pos,(first,second) in enumerate(zip(actions,source_steps),1):
            diff = [k for k in ('map','action','team') if (team(first[k]) != team(second[k]) if k=='team' else first[k] != second[k])]
            if diff:
                differences.append({'step':pos,'fields':diff})
        facts.append(dict(stage2Id=mid, bo=r['bo'], day=day, sourceUrl='https://reloader.gg'+link, retrieval=retrieval,
                          sourceSteps=source_steps, differences=differences))
    facts.sort(key=lambda r:r['stage2Id'])
    assert len({r['stage2Id'] for r in facts}) == 33
    coverage = {}
    for bo in (1,3):
        have = [r for r in facts if r['bo']==bo and len(r['sourceSteps'])==7]
        coverage['BO'+str(bo)] = dict(verified=len(have), allStepsAgree=sum(not r['differences'] for r in have),
            fields=dict(Counter(k for r in have for d in r['differences'] for k in d['fields'])),
            stepChanges=dict(sorted(Counter(str(d['step']) for r in have for d in r['differences']).items())))
    return dict(sourceType='Reloader third-party comparison with archived post-match reports; no input overrides',
                index='https://reloader.gg/esports/cs2/event/iem-cologne-2026',summary=coverage,matches=facts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache',type=Path)
    parser.add_argument('--write',action='store_true')
    args = parser.parse_args()
    result = check(args.cache)
    encoded = json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    output = HERE/'official-crosscheck.json'
    if args.write:
        output.write_bytes(encoded.encode('utf8'))
    else:
        assert output.read_text(encoding='utf8') == encoded
    print(json.dumps(result['summary'],ensure_ascii=False))
