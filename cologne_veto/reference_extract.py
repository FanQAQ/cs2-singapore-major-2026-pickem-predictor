"""Reconstruct the Cologne Stage 2 map actions from pre-Stage-3 public match threads."""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
QUERY = ("https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=GlobalOffensive"
         "&after=2026-06-06&before=2026-06-10&title=IEM%20Cologne%20Major%202026%20Stage%202"
         "&limit=100&sort=asc")
TOURNAMENT = 'IEM Cologne Major 2026 Stage 2'
MAPS = {'Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Overpass'}
META_URL = 'https://cs2metahistory.com/tournaments/iem-cologne-major-2026-stage-2/'
OPENING_URL = 'https://blast.tv/cs/news/everything-you-need-to-know-about-iem-cologne-major-stage-3-and-playoffs'
LOCK = '2026-06-11T09:00:00Z'  # Officially scheduled first matches at 11:00 CEST.
PROFILE_CUTOFF = '2026-06-11T00:00:00Z'  # Training data through June 10 UTC (inclusive).
# Only consulted after parsing each series. Columns are picks, bans, left, first ban, first pick.
META_COUNTS = {'Mirage': [6, 17, 10, 0, 3], 'Nuke': [6, 20, 7, 1, 4],
               'Dust2': [2, 24, 7, 8, 1], 'Ancient': [1, 27, 5, 8, 1],
               'Inferno': [5, 27, 1, 3, 2], 'Overpass': [4, 26, 3, 3, 1],
               'Anubis': [2, 31, 0, 10, 1]}


def utc(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def canonical(team):
    return {'BB': 'BetBoom'}.get(team, team)


def extract(data):
    records = []
    for post in data['data']:
        if post['author'] != 'CS2_PostMatchThreads':
            continue
        names, event, discussion = post['title'].split(' / ')
        assert discussion == 'Post-Match Discussion'
        round_match = re.fullmatch(re.escape(TOURNAMENT) + r' - Swiss Round ([1-5])', event)
        assert round_match
        body = post['selftext']
        match_url = re.search(r'https://www\.hltv\.org/matches/(\d+)/[\w-]+', body)
        assert match_url
        lines = body.split('### Map picks:')[1].strip().split('\n\n', 1)[0].splitlines()
        assert len(lines) == 9
        table = [[s.strip().strip('*') for s in line.strip().strip('|').split('|')]
                 for i, line in enumerate(lines) if i != 1]
        assert table[0] == [names.split(' vs ')[0], 'MAP', names.split(' vs ')[1]]
        created, captured = utc(post['created_utc']), utc(post['retrieved_on'])
        second = utc(post['_meta']['retrieved_2nd_on'])
        assert created <= captured <= second < LOCK
        assert captured < PROFILE_CUTOFF
        # For updated bodies, require the later archived version inside the training window.
        if post['_meta'].get('is_edited') or post['edited']:
            assert second < PROFILE_CUTOFF
        assert not post['edited'] or utc(post['edited']) < PROFILE_CUTOFF
        records.append({'hltvId': int(match_url[1]), 'round': int(round_match[1]),
                        'utcPublishedAt': created, 'utcFirstCapture': captured, 'utcSecondCapture': second,
                        'archiveMarksEdited': bool(post['_meta'].get('is_edited')),
                        'url': 'https://www.reddit.com' + post['permalink'], 'hltvUrl': match_url[0],
                        'table': table, 'tableSha256': hashlib.sha256('\n'.join(lines).encode()).hexdigest()})
    assert len(records) == len(set(r['hltvId'] for r in records)) == 33
    return {'archiveQuery': QUERY, 'stage3ScheduledStartUtc': LOCK, 'stage3ScheduleSource': OPENING_URL,
            'auditUrl': META_URL, 'auditColumns': ['pick', 'ban', 'left', 'firstBan', 'firstPick'],
            'auditTotals': META_COUNTS, 'records': sorted(records, key=lambda r: r['hltvId'])}


def make_ledger(source):
    stages = json.loads((HERE.parent / 'multi_stage/inputs.json').read_bytes())
    field = next(s for s in stages if s['id'] == 'cologne-2026-2')
    team_names = [t['name'] for t in field['teams']]
    fixtures = {}
    for rnd, (pairings, formats) in enumerate(zip(field['rounds'], field['formats']), 1):
        for (w, l), bo in zip(pairings, formats):
            fixtures[(rnd, frozenset([team_names[w], team_names[l]]))] = bo
    count = {m: [0] * 5 for m in MAPS}
    matches = []
    for row in source['records']:
        assert row['utcPublishedAt'] <= row['utcFirstCapture'] < PROFILE_CUTOFF
        assert row['utcFirstCapture'] <= row['utcSecondCapture'] < LOCK
        assert not row['archiveMarksEdited'] or row['utcSecondCapture'] < PROFILE_CUTOFF
        table = row['table']
        assert len(table) == 8 and {s[1] for s in table[1:]} == MAPS
        a, b = canonical(table[0][0]), canonical(table[0][2])
        bo = fixtures.pop((row['round'], frozenset([a, b])))
        actions = []
        for i, (left, map_name, right) in enumerate(table[1:]):
            if i == 6:
                assert not left and not right
                action, team = 'left', None
            else:
                assert bool(left) != bool(right) and (left or right) in ('X', '✔')
                action, team = ('ban' if (left or right) == 'X' else 'pick'), (a if left else b)
            count[map_name][{'pick': 0, 'ban': 1, 'left': 2}[action]] += 1
            if i == 0:
                count[map_name][3] += 1
            if bo == 3 and i == 2:
                count[map_name][4] += 1
            actions.append({'team': team, 'action': action, 'map': map_name})
        first = actions[0]['team']
        other = b if first == a else a
        if bo == 3:
            expected_kind = ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'left']
            expected_actor = [first, other, first, other, other, first, None]
        else:
            expected_kind = ['ban'] * 6 + ['left']
            expected_actor = [first, first, other, other, other, first, None]
        assert [s['action'] for s in actions] == expected_kind, row['hltvId']
        assert [s['team'] for s in actions] == expected_actor, row['hltvId']
        matches.append({'hltvId': row['hltvId'], 'day': row['utcPublishedAt'][:10], 'round': row['round'],
                        'bo': bo, 'a': a, 'b': b, 'actions': actions, 'sources': [row['url'], row['hltvUrl']]})
    assert not fixtures
    assert Counter(m['bo'] for m in matches) == {1: 20, 3: 13}
    assert count == source['auditTotals'] == META_COUNTS, count
    return {'matches': matches}


def serialize(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    group = cli.add_mutually_exclusive_group()
    group.add_argument('--source', type=Path, help='local response to the public archive query')
    group.add_argument('--fetch', action='store_true', help='read the public archive query')
    cli.add_argument('--check', action='store_true', help='verify stored files without writing')
    args = cli.parse_args()
    provenance = HERE / 'reference.json'
    if args.fetch or args.source:
        raw = args.source.read_bytes() if args.source else urlopen(QUERY, timeout=60).read()
        reference = extract(json.loads(raw))
    else:
        reference = json.loads(provenance.read_bytes())
    outputs = [(provenance, reference), (HERE / 'ledger.json', make_ledger(reference))]
    for target, record in outputs:
        if args.check:
            assert json.loads(target.read_bytes()) == record, target
        else:
            target.write_bytes(serialize(record))
    print('33 Stage 2 series verified (20 BO1, 13 BO3); all 7 x 5 aggregate counts agree.')
