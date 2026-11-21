"""Extract Stage 2 only from the public BLAST.tv results and match FAQ pages."""
import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

HERE = Path(__file__).resolve().parent
BASE = 'https://blast.tv/cs/tournaments/iem-cologne-major-2026/match'
MAPS = {v.lower(): v for v in ('Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Overpass')}
# Stable HLTV numeric locators from the Stage 2 event results, sorted by match ID.
PAIRS = (
    'Spirit|BetBoom', 'Astralis|GamerLegion', 'G2|M80', 'FUT Esports|B8',
    'Legacy|MIBR', '9z|FlyQuest', 'paiN|TYLOO', 'Monte|BIG',
    'FUT Esports|TYLOO', 'Astralis|9z', 'G2|Monte', 'paiN|BIG',
    'BetBoom|GamerLegion', 'Legacy|FlyQuest', 'Spirit|MIBR', 'B8|M80',
    'Monte|Legacy', 'Astralis|TYLOO', 'BetBoom|M80', 'MIBR|BIG',
    'B8|GamerLegion', 'FlyQuest|paiN', 'G2|FUT Esports', 'Spirit|9z',
    'Astralis|paiN', 'MIBR|B8', 'Monte|BetBoom', 'TYLOO|9z', 'G2|BIG',
    'M80|Legacy', 'Monte|paiN', 'TYLOO|Legacy', 'BIG|B8',
)


def matches(html, stage_name='Stage 2'):
    cells = []
    for encoded in re.findall(r'streamController\.enqueue\((.+?)\);</script>', html):
        part = json.loads(encoded)
        data = json.loads(part.split(':', 1)[1] if part.startswith('P') else part)
        if isinstance(data, list):
            cells.extend(data)

    def expand(i, depth=0):
        if i < 0 or depth > 10:
            return None
        v = cells[i]
        if isinstance(v, dict):
            return {cells[int(k[1:])]: expand(ref, depth + 1) for k, ref in v.items()}
        if isinstance(v, list):
            if v and v[0] == 'D':
                return datetime.fromtimestamp(v[1] / 1000, timezone.utc).date().isoformat()
            return [expand(ref, depth + 1) if type(ref) is int and 0 <= ref < len(cells) else ref for ref in v]
        return v

    # Fetch only target-stage rows and do not extract later stages' scores.
    keys = {value: '_' + str(i) for i, value in enumerate(cells) if isinstance(value, str)}
    for i, v in enumerate(cells):
        if not isinstance(v, dict) or not all(keys[k] in v for k in ('maps', 'teamAScore', 'stage')):
            continue
        stage = cells[v[keys['stage']]]
        if not isinstance(stage, dict) or cells[stage[keys['name']]] != stage_name:
            continue
        row = expand(i)
        if row['tournament']['id'] == 'iem-cologne-major-2026':
            yield row


def roster_faq(page, a, b):
    for block in re.findall(r'<script type="application/ld\+json">(.+?)</script>', page):
        schema = json.loads(block)
        if schema.get('@type') != 'FAQPage':
            continue
        for qa in schema['mainEntity']:
            if not qa['name'].startswith('Who played in the '):
                continue
            text = qa['acceptedAnswer']['text']
            parsed = re.search(re.escape(a) + r' - (.*?) faced off against ' + re.escape(b)
                               + r' - (.*?) at the IEM Cologne Major 2026', text)
            if not parsed:
                return None
            teams = [re.split(r', | and ', s) for s in parsed.groups()]
            return teams if all(len(set(t)) == len(t) == 5 for t in teams) else None
    return None


def extract(cache, include_rosters):
    html = (cache / 'index.html').read_text(encoding='utf8')
    urls = [urljoin(BASE, link) for link in re.findall(r'href="([^"]+/match/[0-9a-f]{8}/[^"?/]+)"', html)]
    ids = {frozenset(pair.split('|')): 2394865 + i for i, pair in enumerate(PAIRS)}
    rows = []
    for row in matches(html):
        a, b = (row[k]['name'] for k in ('teamA', 'teamB'))
        mid, short = ids[frozenset((a, b))], row['id'][:8]
        links = {url for url in urls if '/match/' + short + '/' in url}
        assert len(links) == 1
        bo = int(row['type'][-1])
        maps = []
        for game in row['maps']:
            x, y = game['teamAScore'], game['teamBScore']
            if x is None or y is None or x == y == 0:
                continue
            assert x != y and min(x, y) >= 0 and max(x, y) >= 13
            maps.append([MAPS[game['name'][3:]], x, y])
        wins = sum(x > y for _, x, y in maps)
        assert (wins, len(maps) - wins) == (row['teamAScore'], row['teamBScore'])
        assert max(wins, len(maps)-wins) == bo//2+1
        assert '2026-06-06' <= row['scheduledAt'] <= '2026-06-09'
        result = dict(stage2Id=mid, blastId=row['id'], day=row['scheduledAt'], bo=bo,
                      a=a, b=b, score=[wins, len(maps)-wins], maps=maps,
                      sourceUrl=links.pop(), streamUrl=row['metadata'].get('externalStreamUrl'),
                      steps=None)
        if include_rosters:
            page = cache / (short + '.html')
            fives = roster_faq(page.read_text(encoding='utf8'), a, b) if page.exists() else None
            result.update(fiveA=fives[0] if fives else None, fiveB=fives[1] if fives else None)
        rows.append(result)
    assert len(rows) == len({r['stage2Id'] for r in rows}) == 33
    assert Counter(r['bo'] for r in rows) == {1:20, 3:13}
    return sorted(rows, key=lambda r:r['stage2Id'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path)
    parser.add_argument('--urls', action='store_true')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    rows = extract(args.cache, not args.urls)
    if args.urls:
        print('\n'.join(r['sourceUrl'] for r in rows))
    else:
        facts = dict(publisher='BLAST.tv', index=BASE+'?view=results',
                     sourceType='third-party match reports; no ordered veto data', matches=rows)
        encoded = json.dumps(facts, ensure_ascii=False, indent=2) + '\n'
        target = HERE/'official-blast.json'
        if args.write:
            target.write_bytes(encoded.encode('utf8'))
        else:
            assert target.read_text(encoding='utf8') == encoded
        print(len(rows), 'series,', sum(len(r['maps']) for r in rows), 'maps,',
              sum(bool(r['fiveA']) for r in rows), 'paired fives in match FAQs')
