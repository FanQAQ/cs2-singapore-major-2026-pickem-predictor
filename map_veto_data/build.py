"""Aggregate frozen team-side veto opportunities. No match outcomes are used."""
import argparse
import gzip
import json
from urllib.parse import urlsplit
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIELDS = ('ban', 'pick', 'banOpportunities', 'pickOpportunities')


def build(evidence):
    events = {}
    for event, meta in json.loads((ROOT / 'map_strength/events.json').read_text()).items():
        pool = meta['pool']
        teams = {name: {f: {'n': 0, **{k: dict.fromkeys(pool, 0) for k in FIELDS}}
                        for f in ('bo1', 'bo3')} for name in meta['teams']}
        events[event] = {'asOf': meta['asOf'], 'pool': pool, 'poolSource': meta['poolSource'],
                         'teams': teams, 'series': 0, 'first': None, 'last': None}
    sources = {key: {} for key in events}
    seen = set()
    matches = {key: set() for key in events}
    for rec in evidence:
        event, team, fmt, day = rec['event'], rec['team'], rec['format'], rec['date']
        meta = events[event]
        signature = (event, team, rec['hltvId'])
        assert signature not in seen and rec['overlap'] in (3,4,5)
        assert len(rec['roster']) == len(set(rec['roster'])) == 5
        assert 0 <= (date.fromisoformat(meta['asOf']) - date.fromisoformat(day)).days < 90
        refs = sources[event].setdefault(rec['vetoSource'], {})
        url = urlsplit(rec['url'])
        assert url.hostname in ('www.hltv.org','hltv.org') and url.path.startswith(f"/matches/{rec['hltvId']}/")
        refs.setdefault(fmt, (rec['hltvId'], rec['url']))
        seen.add(signature)
        matches[event].add(rec['hltvId'])
        values = meta['teams'][team][fmt]
        values['n'] += 1
        pool = meta['pool']
        assert len(rec['counts']) == 4 and all(len(row) == 7 for row in rec['counts'])
        bans, picks, ban_ops, pick_ops = rec['counts']
        assert (sum(bans), sum(picks)) == ((3, 0) if fmt == 'bo1' else (2, 1))
        assert all(0 <= b <= bo and 0 <= p <= po and b + p <= 1
                   for b,p,bo,po in zip(bans,picks,ban_ops,pick_ops))
        assert all(isinstance(n, int) and n >= 0 for row in rec['counts'] for n in row)
        for key, counts in zip(FIELDS, rec['counts']):
            for name, n in zip(pool, counts):
                values[key][name] += n
        meta['first'] = min(meta['first'] or day, day)
        meta['last'] = max(meta['last'] or day, day)
    for event, meta in events.items():
        meta['series'] = len(matches[event])
        source_roots = {
            'smallmeji': ('禁选数据快照 · 2026-10-16', 'https://github.com/smallmeji/hltv-cs2-data-public/tree/f9143e44f3eb5dc1870c903f2707b3c131c9a047/teams'),
            'griffin': ('赛前禁选与当场阵容 · 2026-11-02 截止', 'https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive'),
            'hltvy': ('历史比赛及禁选记录 · 固定存档', 'https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187'),
        }
        links = []
        for source, sample in sorted(sources[event].items()):
            if source in source_roots:
                title, url = source_roots[source]
                links.append(dict(title=title,url=url))
            for fmt, (match, url) in sorted(sample.items()):
                links.append(dict(title=f'{fmt.upper()} 禁选依据 · 比赛 {match}',
                                  url=url))
        meta['sources'] = links
        meta['coverage'] = {fmt: sum(t[fmt]['n'] > 0 for t in meta['teams'].values()) for fmt in ('bo1','bo3')}
    return events


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check', action='store_true')
    check = p.parse_args().check
    with gzip.open(HERE/'evidence.json.gz', 'rt') as f:
        events = build(json.load(f))
    text = json.dumps(events, ensure_ascii=False, separators=(',',':'))+'\n'
    target = HERE/'veto.json'
    if check:
        if target.read_text() != text:
            raise SystemExit('Veto aggregation differs from frozen file.')
    else:
        temp = target.with_suffix('.tmp')
        temp.write_text(text)
        temp.replace(target)
    for event, meta in events.items():
        print(event, meta['series'], meta['coverage'])
