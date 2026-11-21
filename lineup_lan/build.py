"""Audit player and lineup appearances at verified pre-stage international LAN events."""
import argparse
import csv
import gzip
import json
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
REGIONAL = HERE.parent / 'region_risk'
WINDOW = 180
# Use the same spelling corrections as the website's recent-form model.
ALIASES = {'rmn': 'roman', 'ahang': 'l1hang', 'snowzin': 'snow', 'dev1ce': 'device'}


def player_key(handle):
    normalized = unicodedata.normalize('NFKC', handle).strip().casefold()
    return ALIASES.get(normalized, normalized)


def five(players):
    roster = set(map(player_key, players))
    if len(players) != 5 or len(roster) != 5 or '' in roster:
        raise ValueError(f'Invalid five: {players}')
    return roster


def qualify(rows, schedule, start, as_of):
    tournaments = defaultdict(list)
    for series in rows:
        tournaments[(series['day'][:4],series['tournament'])].append(series)
    retained = []
    for tournament, games in tournaments.items():
        first, last = schedule[tournament]
        if first < start or last > as_of:
            continue
        regions = {g[side] for g in games for side in ('ra','rb')}
        if len(regions) >= 2:
            retained.extend(games)
    return retained


def stage(anchor, all_games, schedule):
    end = anchor['asOf']
    start = (date.fromisoformat(end) - timedelta(days=WINDOW-1)).isoformat()
    games = qualify(all_games, schedule, start, end)
    teams = {}
    ownership = {}
    for team, data in anchor['teams'].items():
        handles = data['roster']
        roster = five(handles)
        review = {'coreN':0, 'fullFiveN':0, 'crossCoreN':0, 'players':[]}
        teams[team] = review
        for name in handles:
            ident = player_key(name)
            if ident in ownership:
                raise ValueError(f'{name} was assigned to multiple target lineups.')
            player = {'name':name, 'n':0, 'crossN':0, 'outsideCoreN':0, 'ratedN':0, 'residualSum':0.}
            review['players'].append(player)
            ownership[ident] = (team, roster, player)
    ids = set()
    for g in games:
        assert g['id'] not in ids and g['snapshot'] < g['day'] <= end
        ids.add(g['id'])
        a, b = five(g['a'].split('|')), five(g['b'].split('|'))
        if a & b or g['y'] not in ('0','1'):
            raise ValueError('Conflicting sides or outcome in LAN source.')
        y = int(g['y'])
        p = None
        if g['pointsA'] and g['pointsB']:
            gap = float(g['pointsA']) - float(g['pointsB'])
            p = 1. / (1. + 10. ** (-gap/400.))
        cross = g['ra'] != g['rb']
        for lineup, residual in [(a, None if p is None else y-p), (b, None if p is None else p-y)]:
            touched = set()
            for handle in sorted(lineup):
                if handle not in ownership:
                    continue
                target, target_five, current = ownership[handle]
                overlap = len(lineup & target_five)
                current['n'] += 1
                current['crossN'] += int(cross)
                current['outsideCoreN'] += int(overlap < 3)
                if residual is not None:
                    current['ratedN'] += 1
                    current['residualSum'] += residual
                if target not in touched and overlap >= 3:
                    touched.add(target)
                    teams[target]['coreN'] += 1
                    teams[target]['fullFiveN'] += int(overlap == 5)
                    teams[target]['crossCoreN'] += int(cross)
    for team in teams.values():
        assert 0 <= team['fullFiveN'] <= team['coreN'] and team['crossCoreN'] <= team['coreN']
        team['coverage'] = ('fullFive' if team['fullFiveN'] else 'coreOnly' if team['coreN'] else 'noCore')
        for player in team['players']:
            value = player.pop('residualSum')
            player['teamResidual'] = round(value / (player['ratedN'] + 5.), 6) if player['ratedN'] else None
            assert max(player['outsideCoreN'],player['crossN'],player['ratedN']) <= player['n']
    days = [row['day'] for row in games]
    return {'asOf':end, 'windowStart':start, 'windowDays':WINDOW,
            'first':min(days,default=None), 'last':max(days,default=None),
            'series':len(games),'teams':teams}


def generate():
    anchors = json.loads((REGIONAL/'anchor.json').read_text())
    with gzip.open(REGIONAL/'evidence.csv.gz','rt') as stream:
        rows = list(csv.DictReader(stream))
    full_dates = json.loads((REGIONAL/'schedule.json').read_text())
    schedule = {(str(rec['year']), rec['event']):(rec['first'],rec['last']) for rec in full_dates}
    return {event:stage(data, rows, schedule) for event,data in anchors.items()}


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--check', action='store_true')
    check = args.parse_args().check
    result = generate()
    text = json.dumps(result, ensure_ascii=False, separators=(',',':'), allow_nan=False)+'\n'
    output = HERE/'events.json'
    if check:
        assert output.read_text() == text, 'Frozen roster audit differs from its inputs.'
    else:
        temp = output.with_suffix('.tmp')
        temp.write_text(text)
        temp.replace(output)
    for event, value in result.items():
        teams = value['teams'].values()
        print(event,value['series'],sum(t['coreN']>0 for t in teams),sum(t['fullFiveN']>0 for t in teams),
              sum(p['n']>0 for t in teams for p in t['players']))
