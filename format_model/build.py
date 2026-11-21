"""Build pre-stage BO1/BO3 calibration from explicit format labels and frozen Valve observations."""
import argparse
import csv
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'datajob'))
from build_features import roster_key
SOURCES = {
    "pushbuild": (
        "pushbuild/open-data", "esports%2Fcs2_liquipedia_series.csv", 1,
        "https://www.kaggle.com/datasets/pushbuild/open-data/versions/1"),
    "ektarr": (
        "ektarr/counter-strike-pro-matches", "cs2_all_tiers_games.csv", 11,
        "https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11"),
}
# Only align unambiguous brand variants. Junior, female and secondary rosters retain their own names.
ALIASES = {
    "9zteam": "9z", "bcgameesports": "bcgame", "betboomteam": "betboom",
    "complexitygaming": "complexity", "dendelecs": "dendele", "fazeclan": "faze",
    "imperialesports": "imperial", "lynnvisiongaming": "lynnvision",
    "nrgesports": "nrg", "sharksesports": "sharks", "sinnersesports": "sinners",
    "teamfalcons": "falcons", "teamliquid": "liquid", "teamspirit": "spirit",
    "teamvitality": "vitality", "thehunsesports": "thehuns", "wildcardgaming": "wildcard",
    "g2esports": "g2", "gamerlegion": "gamerlegion", "furiaesports": "furia",
    "virtuspro": "virtuspro", "auroragaming": "aurora", "teamheretics": "heretics",
    "natusvincere": "natusvincere", "navi": "natusvincere", "sashiesport": "sashi",
    "ogesports": "og", "paingaming": "pain", "mousesports": "mouz",
}

def norm(name):
    key = re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", name).casefold())
    return ALIASES.get(key, key)

def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        yield from csv.DictReader(source)

SOURCE_SHA256 = {
    "pushbuild": "20ec7d1ba725c9b7cd7bd390dac1c86e68f63943fea61539ecf673bd8212bacf",
    "ektarr": "d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972",
}

def number(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None

def format_source(source, row):
    if source == "pushbuild":
        best_of = number(row["best_of"])
        points = (number(row["score1"]), number(row["score2"]))
        winner = norm(row["winner"])
        day = row["date_utc"][:10]
    else:
        if row["is_total"] != "True":
            return None
        best_of = number(row["bestOf"])
        points = (number(row["score1_match"]), number(row["score2_match"]))
        if None in points or number(row["games_played"]) != sum(points):
            return None
        winner = norm(row["team1"] if points[0] > points[1] else row["team2"])
        day = row["datetime"][:10]
    if best_of not in (1, 3) or None in points or points[0] == points[1] or min(points) < 0:
        return None
    # Some Liquipedia BO1s record rounds; their explicit best_of stays authoritative.
    if best_of == 3 and max(points) != 2:
        return None
    if best_of == 1 and max(points) not in (1, 13) and max(points) < 16:
        return None
    teams = (norm(row["team1"]), norm(row["team2"]))
    if not all(teams) or teams[0] == teams[1] or winner != teams[0 if points[0] > points[1] else 1]:
        return None
    return (day, *sorted(teams)), (best_of, winner)

def label_rows(cache):
    by_key = defaultdict(dict)
    for src, (dataset, filename, version, _) in SOURCES.items():
        path = cache / filename
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://www.kaggle.com/api/v1/datasets/download/{dataset}/{filename}?datasetVersionNumber={version}"
            with urlopen(url, timeout=90) as r:
                raw = r.read()
            path.write_bytes(raw)
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if file_hash != SOURCE_SHA256[src]:
            raise ValueError(f"Unexpected data revision for {src}: {file_hash}")
        for row in read_csv(path):
            match = format_source(src, row)
            if match is None:
                continue
            key, observed = match
            by_key[key].setdefault(src, []).append(observed)
    matched = {}
    for key, sources in by_key.items():
        distinct = {obs for source_rows in sources.values() for obs in source_rows}
        if len(distinct) == 1 and all(len(rows) == 1 for rows in sources.values()):
            matched[key] = (*distinct.pop(), "+".join(sorted(sources)))
    return matched

def prob(log_odds):
    return 1 / (1 + math.exp(-max(-35, min(35, log_odds))))

def fit_slope(rows, prior, precision):
    # Constrained regularized one-parameter logistic calibration; swapped team order is immaterial.
    lower, upper = 0.04, 2.0
    for _ in range(45):
        beta = (upper + lower) / 2
        grad = precision * (beta - prior) + sum(x * (prob(beta*x) - y) for x, y in rows)
        if grad > 0:
            upper = beta
        else:
            lower = beta
    return (upper + lower) / 2

def global_scales(rows):
    pooled = [(x, y) for _, _, x, y in rows]
    base = fit_slope(pooled, math.log(10)/4, 2.0)
    groups = {f:[(x,y) for _, fmt,x,y in rows if fmt==f] for f in (1,3)}
    share3 = len(groups[3])/len(pooled)
    # Weak structural prior: BO3's slope is 1.3x BO1, inside the iid maps local limit 1.5.
    # Scores are still fitted to actual labelled series, and can override that prior.
    bo1_prior = base/(1 + .30*share3)
    slopes = {fmt: fit_slope(group, bo1_prior*(1.30 if fmt==3 else 1), 120.0)
              for fmt, group in groups.items()}
    center = (1-share3)*slopes[1] + share3*slopes[3]
    return base, share3, {f:slopes[f]/center for f in slopes}

def team_contrast(rows, scales, base):
    groups = {f:[(x,y) for fmt,x,y in rows if fmt==f] for f in (1,3)}
    out = {f"bo{f}":dict(n=len(rr), w=sum(y for _,y in rr)) for f,rr in groups.items()}
    # A shared nuisance intercept removes a team's general outperformance. A centered
    # format term estimates only its residual BO3-vs-BO1 difference. For one observed
    # format there is no empirical contrast; use exactly zero in both predictions.
    tilt, se = 0., .60
    if groups[1] and groups[3]:
        intercept = 0.
        share_team = len(groups[3])/len(rows)
        for _ in range(18):
            g0,g1 = intercept/(1.5**2), tilt/(.60**2)
            h00,h01,h11 = 1/(1.5**2),0.,1/(.60**2)
            for fmt,x,y in rows:
                z = float(fmt==3)-share_team
                p = prob(scales[fmt]*base*x + intercept + z*tilt)
                g0 += p-y
                g1 += z*(p-y)
                weight = p*(1-p)
                h00 += weight
                h01 += weight*z
                h11 += weight*z*z
            det = h00*h11-h01*h01
            d0, d1 = (h11*g0-h01*g1)/det, (h00*g1-h01*g0)/det
            intercept -= d0
            tilt -= d1
            se = (h00/det)**.5
            if max(abs(d0),abs(d1)) < 1e-8:
                break
    return dict(**out, tilt=round(tilt,7), tiltSE=round(se,7))

def lineup_series(histories, event, team, match):
    """Use each verified series once from the target core's historical perspective."""
    roster = roster_key(team['roster'])
    if not roster:
        return []
    result = {}
    for r in histories:
        if r['event'] != event:
            continue
        own = roster_key(r['lineup'].split('|'))
        opponent = roster_key(r['opponentLineup'].split('|'))
        if not opponent or own & opponent or len(own & roster) < 3:
            continue
        fmt = match(r, r['historicalTeam'], r['opponent'])
        if fmt is not None:
            key = (r['date'], r['matchInSnapshot'])
            value = (fmt, (float(r['ownPoints']) - float(r['oppPoints']))/100, int(r['y']))
            if key in result and result[key] != value:
                raise ValueError(f'Conflicting roster-aligned series {event} {key}')
            result[key] = value
    return list(result.values())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=HERE/'cache')
    parser.add_argument('--refresh-labels', action='store_true',
                        help='Reconcile both pinned source files; by default use the packaged extract.')
    arg = parser.parse_args()
    extract = HERE/'labels.csv'
    use_extract = extract.exists() and not arg.refresh_labels
    labels = {} if use_extract else label_rows(arg.cache)
    frozen = {(r['event'],r['date'],r['matchInSnapshot']): r for r in read_csv(extract)} if use_extract else {}
    fits = list(read_csv(ROOT/'fitting'/'fit_examples.csv'))
    histories = list(read_csv(ROOT/'datajob'/'history.csv'))
    features = json.loads((ROOT/'datajob'/'features.json').read_text())
    out = {}
    export = {}
    for event, snapshot in features.items():
        as_of = snapshot["asOf"]
        matches_by_pair = defaultdict(set)
        for records, left, right in [(fits,"teamA","teamB"),(histories,"historicalTeam","opponent")]:
            for record in records:
                if record['event'] == event:
                    key = (record['date'], *sorted((norm(record[left]), norm(record[right]))))
                    matches_by_pair[key].add(record['matchInSnapshot'])
        def match(row,a,b):
            day = row["date"]
            if day > as_of:
                raise ValueError("VRS row exceeds stage cutoff")
            if use_extract:
                existing = frozen.get((event,day,row['matchInSnapshot']))
                return int(existing['bestOf']) if existing else None
            key = (day, *sorted((norm(a),norm(b))))
            observed = labels.get(key)
            winner = norm(a if int(row['y']) else b)
            if len(matches_by_pair[key]) != 1 or not observed or winner != observed[1]:
                return None
            mid = row['matchInSnapshot']
            export[(event,mid)] = (event, day, mid, observed[0], observed[2])
            return observed[0]
        series = []
        for row in fits:
            if row['event'] != event:
                continue
            f = match(row, row['teamA'], row['teamB'])
            if f:
                series.append((row['date'],f,float(row['vrsPer100']),int(row['y'])))
        if not series:
            raise RuntimeError("No labelled series")
        base,share3,scales = global_scales(series)
        teams = {}
        for team in snapshot['teams']:
            rows = lineup_series(histories, event, team, match)
            teams[team['name']] = team_contrast(rows,scales,base)
        # A diagnostic of the global format slope only (form and team adjustments omitted).
        split = (date.fromisoformat(as_of) - timedelta(days=20)).isoformat()
        train = [r for r in series if r[0] < split]
        valid = [r for r in series if r[0] >= split]
        beta,_,cv_scales = global_scales(train)
        def brier(conditional):
            return sum((prob(beta*x*(cv_scales[f] if conditional else 1))-y)**2
                        for _,f,x,y in valid)/len(valid)
        data = dict(asOf=as_of, shareBO3=round(share3,7), scale={"bo1":round(scales[1],7),"bo3":round(scales[3],7)},
                    nBO1=sum(f==1 for _,f,_,_ in series), nBO3=sum(f==3 for _,f,_,_ in series),
                    validationGlobalOnly=dict(n=len(valid),bo1=sum(f==1 for _,f,_,_ in valid),sharedBrier=round(brier(False),6),splitBrier=round(brier(True),6)),
                    teams=teams, sources=[item[3] for item in SOURCES.values()])
        print(event, data['nBO1'], data['nBO3'], data['scale'], data['validationGlobalOnly'],
              'team BO1/BO3', sum(t['bo1']['n'] for t in teams.values()),sum(t['bo3']['n'] for t in teams.values()),
              'with both',sum(min(t['bo1']['n'],t['bo3']['n'])>0 for t in teams.values()))
        out[event]=data
    (HERE/'model.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
    if use_extract:
        return
    with extract.open('w',newline='') as dest:
        writer=csv.writer(dest, lineterminator="\n")
        writer.writerow(['event','date','matchInSnapshot','bestOf','source'])
        writer.writerows(sorted(export.values()))

if __name__ == '__main__':
    main()
