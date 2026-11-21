"""Join dated seven-step veto facts to five-player rosters and retain derived counts."""
import argparse
import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from build import FIELDS, HERE, ROOT

sys.path.insert(0, str(ROOT))
from map_strength.build import POOLS, entries, roster, team_for
from strategy_v4.prepare import map_sides


def simple(value):
    return re.sub('[^a-z0-9]', '', value.lower())


# Only exact identities and known abbreviations equate names across sources.
ALIASES = {
    'auroragaming':'aurora', 'teamliquid':'liquid', 'teamspirit':'spirit',
    'g2esports':'g2', 'teamheroic':'heroic', 'fazeclan':'faze', '9zteam':'9z',
    'teamfalcons':'falcons', '100t':'100thieves', 'navi':'natusvincere',
    'paingaming':'pain', 'monteesports':'monte', 'flyquestcs':'flyquest',
    'themongolz':'mongolz', 'bcgameesports':'bcgame', 'imperialesports':'imperial',
    'nip':'ninjasinpyjamas', 'b8esports':'b8', 'betboomteam':'betboom',
    'sinnersesports':'sinners','lynnvisiongaming':'lynnvision','wildcardgaming':'wildcard',
    'nrgesports':'nrg','dendelecs':'dendele',
    'furiaesports':'furia','complexitygaming':'complexity','enceesports':'ence',
    'ef':'eternalfire','mousesports':'mouz','mibrteam':'mibr','fnaticteam':'fnatic',
    'teamog':'og'
}


def org(s):
    return ALIASES.get(simple(s), simple(s))


def choices(match, pool):
    """Reject incomplete, unassigned, duplicate, wrong-format and cross-pool actions."""
    steps, bo = match['steps'],match['bo']
    if bo not in (1,3) or len(steps) != 7 or {s[2] for s in steps} != set(pool):
        return None
    expected = ['ban'] * 6 if bo == 1 else ['ban','ban','pick','pick','ban','ban']
    if [s[1] for s in steps] != expected + ['left'] or steps[-1][0] is not None:
        return None
    result = {side:{field:[0] * 7 for field in FIELDS} for side in ('a','b')}
    available = set(pool)
    for side, action, name in steps[:-1]:
        if side not in result:
            return None
        vals = result[side]
        vals[action][pool.index(name)] += 1
        for option in available:
            vals[action+'Opportunities'][pool.index(option)] += 1
        available.remove(name)
    for v in result.values():
        if (sum(v['ban']),sum(v['pick'])) != ((3,0) if bo == 1 else (2,1)):
            return None
    return result


def game_index(path):
    maps = defaultdict(list)
    with path.open() as f:
        for r in csv.DictReader(f):
            if r['is_total'] == 'False':
                maps[r['match_id']].append(r)
    idx = defaultdict(list)
    for ident, rows in maps.items():
        first = rows[0]
        sides = map_sides(first)
        if (not sides or not first['bestOf'] or any(map_sides(r) != sides for r in rows)
                or any(first['datetime'][:10] != r['datetime'][:10] for r in rows)):
            continue
        bo = int(float(first['bestOf']))
        if bo not in (1,3):
            continue
        try:
            final = tuple(int(float(first['score%d_match' % side])) for side in (1,2))
            scorelines = [(int(float(r['score1_game'])),int(float(r['score2_game']))) for r in rows]
        except ValueError:
            continue
        won = sum(x > y for x,y in scorelines)
        if (max(final) != bo//2+1 or final != (won,len(rows)-won)
                or any(x == y for x,y in scorelines)
                or len({r['game_id'] for r in rows}) != len(rows)
                or len({r['map_name'] for r in rows}) != len(rows)):
            continue
        day = first['datetime'][:10]
        names = [org(first['team1']),org(first['team2'])]
        played = {r['map_name'] for r in rows}
        for i in (0,1):
            idx[day,bo,names[i],names[1-i]].append((ident,[sides[i],sides[1-i]],played))
    return idx


def identify(match, idx):
    played_candidates = {m for _, action, m in match['steps'] if action in ('pick','left')}
    key = (match['day'], match['bo'], org(match['a']),org(match['b']))
    candidates = [(code, r) for code,r,maps in idx[key] if maps and maps <= played_candidates]
    direct = None
    if match.get('lineupA') and match.get('lineupB'):
        if len(match['lineupA']) != 5 or len(match['lineupB']) != 5:
            return None
        try:
            direct = [roster(match['lineupA']),roster(match['lineupB'])]
        except ValueError:
            return None
        if direct[0] & direct[1]:
            return None
    if direct:
        # Direct source identity is authoritative when there is no alternate join;
        # conflicting rosters for the same unique cross-source fixture are excluded.
        if len(candidates) > 1 or (len(candidates)==1 and candidates[0][1]!=direct):
            return None
        return direct, ('match lineup; Ektarr '+candidates[0][0] if len(candidates)==1 else 'match lineup')
    if len(candidates) == 1:
        return candidates[0][1], 'Ektarr '+candidates[0][0]
    return None


def prepare(sources, stats):
    specs = entries()
    lookup = game_index(stats)
    combined = defaultdict(list)
    for label, path in sources:
        with path.open() as f:
            for rec in json.load(f):
                url = urlsplit(rec['url'])
                m = re.search(r'/matches/(\d+)(?:/|$)', url.path)
                if not m or not url.hostname or url.hostname.removeprefix('www.')!='hltv.org':
                    raise ValueError('Unknown match identity '+rec['url'])
                combined[int(m.group(1))].append((label, rec))
    evidence=[]
    for ident, copies in sorted(combined.items()):
        # Different rows can originate from the two opposing team histories.
        # Check all sources agree on time, format and the actor for each step.
        def sig(r):
            return (r['day'],r['bo'],tuple(sorted([org(r['a']),org(r['b'])])),
                    tuple((org(r[s]) if s is not None else None,act,mp) for s,act,mp in r['steps']))
        if len({sig(r) for _,r in copies}) > 1:
            continue
        copies.sort(key=lambda z:bool(z[1].get('lineupA') and z[1].get('lineupB')), reverse=True)
        label, match=copies[0]
        info = identify(match,lookup)
        if not info:
            continue
        fives, lineage=info
        for event,(cutoff, field) in specs.items():
            if label in ('smallmeji','griffin') and event!='singapore':
                continue  # October's exported top-team list does not select older events.
            if not 0 <= (cutoff-date.fromisoformat(match['day'])).days < 90:
                continue
            pool = POOLS[event][0].split()
            table = choices(match,pool)
            if not table:continue
            for i,side in enumerate(('a','b')):
                who=team_for(fives[i],field)
                if not who:continue
                name,overlap=who
                evidence.append(dict(event=event,team=name,hltvId=ident,url=match['url'],date=match['day'],
                    format='bo'+str(match['bo']),overlap=overlap,roster=sorted(fives[i]),rosterSource=lineage,
                    vetoSource=label,counts=[table[side][k] for k in FIELDS]))
    return sorted(evidence,key=lambda r:(r['event'],r['date'],r['hltvId'],r['team']))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--games',type=Path, required=True)
    p.add_argument('--input', action='append',required=True,metavar='SOURCE=PATH')
    args=p.parse_args()
    sources=[(label,Path(name)) for label,name in (x.split('=',1) for x in args.input)]
    data=prepare(sources,args.games)
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    temp=HERE/'evidence.tmp'
    temp.write_bytes(gzip.compress(raw,mtime=0))
    temp.replace(HERE/'evidence.json.gz')
    print(f'{len(data)} accepted team-side observations')
