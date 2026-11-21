"""Extract only rank, team name and lineup from dated public weekly snapshots."""
import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATES = {
    'copenhagen': '2024-03-11', 'shanghai': '2024-11-25', 'austin': '2025-06-02',
    'budapest': '2025-11-17', 'cologne': '2026-06-01', 'singapore': '2026-11-16'
}


def extract(cache):
    historical = json.loads((ROOT/'history24/fixtures.json').read_text(encoding='utf-8'))
    rosters = {**{k: v['rosters'] for k, v in historical.items()},
               **json.loads((ROOT/'datajob/stage_rosters.json').read_text(encoding='utf-8'))}
    result = {}
    for event, stamp in DATES.items():
        raw = (cache / (stamp + '.json')).read_bytes()
        source = json.loads(raw)
        assert source['date'] == stamp and source['type'] == 'world'
        day = date.fromisoformat(stamp)
        current_handles = {p.casefold() for roster in rosters[event].values() for p in roster}
        rows = []
        for team in source['teams']:
            lineup = [p['name'] for p in team['players']]
            if (event == 'copenhagen' or (event == 'shanghai' and team['rank'] <= 30)
                    or len(current_handles.intersection(p.casefold() for p in lineup)) >= 2):
                rows.append(dict(rank=team['rank'], team=team['name'], roster=lineup))
        result[event] = dict(date=stamp, totalRanks=len(source['teams']),
                             source=f'https://www.hltv.org/ranking/teams/{day:%Y}/{day:%B}'.lower() + f'/{day.day}',
                             archive=f'https://raw.githubusercontent.com/julienc91/hltv-ranking/rankings/{day.year}/{stamp}.json',
                             sha256=hashlib.sha256(raw).hexdigest(), rows=rows)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('cache', type=Path, help='Directory containing archived YYYY-MM-DD.json files')
    args = parser.parse_args()
    (HERE/'snapshots.json').write_text(json.dumps(extract(args.cache), indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
