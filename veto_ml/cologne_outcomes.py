"""Verify Cologne Stage 1 and Stage 3 BO3 outcome labels against two match reports."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cologne_veto.official_blast import BASE, MAPS, matches
from cologne_veto.reference_extract import utc

FEED = ('https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=GlobalOffensive'
        '&author=CS2_PostMatchThreads&after=2026-06-11&before=2026-06-16&limit=100&sort=asc')


def team(name):
    return {'Parivision': 'PARIVISION', 'BB': 'BetBoom', 'Team Falcons': 'Falcons',
            'FUT Esports': 'FUT', 'DENDELE':'Sharks', 'Team Liquid':'Liquid',
            'Sinners Esports':'SINNERS'}.get(name, name)


def extract(feed, html, stage):
    if stage == 1:
        rounds = json.loads((ROOT/'fixtures/fixtures.json').read_bytes())['cologne']['rounds']
    else:
        field = next(f for f in json.loads((ROOT/'multi_stage/inputs.json').read_bytes()) if f['id'] == 'cologne-2026-3')
        names = [t['name'] for t in field['teams']]
        rounds = [[(names[a],names[b]) for a,b in rnd] for rnd in field['rounds']]
    winners = {(i, frozenset((a,b))):a for i,rnd in enumerate(rounds,1) for a,b in rnd}
    blast = {frozenset(team(r[k]['name']) for k in ('teamA', 'teamB')):r for r in matches(html, 'Stage '+str(stage))}
    links = re.findall(r'href="([^"]+/match/[0-9a-f]{8}/[^"?/]+)"', html)
    rows = []
    for post in feed['data']:
        label = ' Stage 1' if stage == 1 else ''
        title = re.fullmatch(r'(.+) vs (.+) / IEM Cologne Major 2026'+label+r' - Swiss Round ([1-5]) / Post-Match Discussion', post['title'])
        if not title or post['author'] != 'CS2_PostMatchThreads':
            continue
        a, b = team(title[1]), team(title[2])
        rnd = int(title[3])
        key = frozenset((a,b))
        report = blast.pop(key)
        fixture_winner = winners.pop((rnd,key))
        if report['type'] == 'BO1':
            assert stage == 1 and team(report['teamA' if report['teamAScore'] > report['teamBScore'] else 'teamB']['name']) == fixture_winner
            continue
        body = post['selftext']
        header = re.search(r'\[(\d)-(\d)\]\((https://www\.hltv\.org/matches/(\d+)/[\w-]+)\)', body)
        score = list(map(int, header.group(1, 2)))
        assert max(score) == 2 and min(score) in (0, 1)
        winner = a if score[0] > score[1] else b
        assert fixture_winner == winner
        src = {link for link in links if '/match/' + report['id'][:8] + '/' in link}
        assert len(src) == 1 and report['type'] == 'BO3'
        flip = a != team(report['teamA']['name'])
        official_score = [report['teamAScore'], report['teamBScore']]
        assert score == (official_score[::-1] if flip else official_score)
        raw = body.split('### Map picks:')[1].strip().split('\n\n', 1)[0].splitlines()
        table = [[c.strip().strip('*') for c in line.strip().strip('|').split('|')] for line in raw]
        assert len(table) == 9 and table[0] == [title[1], 'MAP', title[2]]
        steps = []
        for left, name, right in table[2:]:
            assert name in MAPS.values() and not (left and right)
            value = left or right
            action = {'X': 'ban', '✔': 'pick', '': 'left'}[value]
            steps.append(dict(action=action, map=name, team=(a if left else b) if value else None))
        assert len(set(s['map'] for s in steps)) == 7
        first = steps[0]['team']
        other = b if a == first else a
        assert [s['team'] for s in steps] == [first, other, first, other, other, first, None]
        assert [s['action'] for s in steps] == ['ban','ban','pick','pick','ban','ban','left']
        game_maps = []
        for game in report['maps']:
            scores = [game['teamAScore'], game['teamBScore']]
            game_maps.append(dict(map=MAPS[game['name'][3:]], score=scores[::-1] if flip else scores))
        expected = [s['map'] for s in steps if s['action'] != 'ban']
        assert expected == [g['map'] for g in game_maps]
        played = re.findall(r'^\*\*([A-Za-z0-9]+):\*\* (\d+)-(\d+)', body, re.M)
        assert [[m,int(x),int(y)] for m,x,y in played] == [
            [g['map'], *g['score']] for g in game_maps if g['score'] != [0,0]]
        assert len(played) == sum(score)
        rows.append(dict(id=int(header[4]), round=rnd, day=report['scheduledAt'], teams=[a,b],
                         bo=3, played=True, winner=winner, score=score, steps=steps, maps=game_maps,
                         sourceUrl=header[3], thread='https://www.reddit.com'+post['permalink'],
                         blastUrl='https://blast.tv'+src.pop(), publishedUtc=utc(post['created_utc']),
                         archivedUtc=utc(post['retrieved_on']),
                         tableSha256=hashlib.sha256('\n'.join(raw).encode()).hexdigest()))
    assert len(rows) == len(set(r['id'] for r in rows)) == (13 if stage == 1 else 33) and not winners and not blast
    url = FEED if stage == 3 else FEED.replace('06-11','06-02').replace('06-16','06-06')
    return dict(id='cologne' if stage == 1 else 'cologne-2026-3', role='outcome', feed=url, resultsIndex=BASE+'?view=results',
                rows=sorted(rows, key=lambda r:r['id']))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('feed', type=Path)
    cli.add_argument('blast_html', type=Path)
    cli.add_argument('--stage', type=int, choices=(1,3), default=3)
    cli.add_argument('--check', action='store_true')
    args = cli.parse_args()
    result = extract(json.loads(args.feed.read_bytes()), args.blast_html.read_text(encoding='utf-8'), args.stage)
    target = ROOT/'veto_ml'/('cologne1-outcomes.json' if args.stage == 1 else 'cologne-outcomes.json')
    if args.check:
        assert result == json.loads(target.read_bytes())
    else:
        target.write_bytes((json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n').encode())
    print(len(result['rows']), 'verified three-map drafts,', sum(min(r['score']) == 0 for r in result['rows']), 'unplayed deciders')
