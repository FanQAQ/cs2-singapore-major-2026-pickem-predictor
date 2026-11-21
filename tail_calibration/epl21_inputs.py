"""Reconstruct EPL 21 Stage 2 from the public pre-stage ballots, lineups and March VRS."""
import argparse
import gzip
import hashlib
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from map_veto_data.extract_archive import COMMIT as ARCHIVE_COMMIT, SHA256, key, normalize
from round_form.epl22_inputs import draw, ranking, utc_day

EVENT = "ESL Pro League Season 21"
ID, START, END = "epl21-stage2", "2025-03-07", "2025-03-11"
SEEDS = ["Spirit", "Vitality", "Natus Vincere", "MOUZ", "G2", "The MongolZ", "Eternal Fire", "Falcons",
         "Liquid", "3DMAX", "GamerLegion", "paiN", "FURIA", "SAW", "MIBR", "TYLOO"]
DIRECT = {"Spirit", "Vitality", "The MongolZ", "MOUZ", "Falcons", "Liquid", "G2", "Natus Vincere"}
VRS_DAY = "2025-03-03"
VRS_COMMIT = "293e01e588b5e751ee0b306dc2958765dc63dce0"
SEED_SOURCE = "https://x.com/ESLCS/status/1897655742146007083"
VOTE_SOURCE = "https://x.com/ESLCS/status/1897716421922045960"
RULES = "https://pro.eslgaming.com/tour/zh/2025/03/esl-live-ratings/"
ROSTER_SOURCE = "https://www.hltv.org/news/41133/esl-pro-league-21-stage-2-first-round-matches-set"
# All 16 five-player team lists in the March 6 stage announcement.
ANNOUNCED = {
    "Spirit": "chopper sh1ro magixx zont1x donk", "Vitality": "apEX ropz ZywOo flameZ mezii",
    "Natus Vincere": "Aleksib iM b1t jL w0nderful", "MOUZ": "Brollan torzsi Spinx Jimpphat xertioN",
    "G2": "Snax huNter- malbsMd m0NESY HeavyGod", "The MongolZ": "bLitz Techno Senzu mzinho 910",
    "Eternal Fire": "MAJ3R XANTARES woxic Wicadia jottAAA", "Falcons": "NiKo Magisk TeSeS degster kyxsan",
    "Liquid": "jks NAF NertZ Twistzz ultimate", "3DMAX": "bodyy Maka Lucky Ex3rcice Graviti",
    "GamerLegion": "REZ ztr Tauson sl3nd PR", "paiN": "biguzera dav1deuS nqz kauez snow",
    "FURIA": "FalleN chelo yuurih KSCERATO skullz", "SAW": "MUTiRiS story Ag1l AZUWU cej0t",
    "MIBR": "exit Lucaozy saffee brnz4n insani", "TYLOO": "Attacker JamYoung Jee Mercury Moseyuh",
}
# Each cell is the official one-based seed of the team named in this ballot slot.
# Rows follow the four columns of each of ESL's four published charts.
BALLOTS = {
    "G2": [1,3,2,4,7,8,6,10,9,13,11,14,15,12,16],
    "Spirit": [2,3,4,5,9,6,8,7,10,13,11,14,15,12,16],
    "The MongolZ": [1,2,3,4,8,7,5,9,10,11,13,12,14,15,16],
    "Vitality": [1,3,7,4,5,8,6,9,11,10,12,13,15,14,16],
    "MOUZ": [2,1,3,5,7,6,9,8,12,10,11,13,14,15,16],
    "Natus Vincere": [1,2,4,7,5,6,8,9,10,11,13,14,12,15,16],
    "Falcons": [1,2,3,7,4,5,6,9,13,11,12,10,15,14,16],
    "Liquid": [2,1,4,3,6,7,8,5,10,12,11,13,15,16,14],
    "GamerLegion": [1,2,3,5,6,4,8,7,9,10,12,13,14,15,16],
    "SAW": [1,2,3,4,6,8,7,5,9,10,11,12,13,15,16],
    "MIBR": [2,1,3,5,4,6,7,8,9,11,12,10,13,14,16],
    "Eternal Fire": [2,1,3,6,4,5,10,11,8,13,12,15,14,9,16],
    "3DMAX": [2,1,3,4,6,8,5,7,9,11,12,13,15,14,16],
    "TYLOO": [1,2,6,4,3,5,8,7,11,9,13,12,10,14,15],
    "paiN": [1,2,3,5,7,4,6,8,9,11,10,15,13,14,16],
    "FURIA": [2,1,3,4,6,5,7,8,11,9,10,14,12,15,16],
}


def ballot_ratings():
    assert set(BALLOTS) == set(SEEDS)
    for voter, row in BALLOTS.items():
        assert len(row) == 15 and set(row) == set(range(1, 17)) - {SEEDS.index(voter) + 1}
    ratings, details = [], []
    for seed, name in enumerate(SEEDS, 1):
        votes = {voter: row.index(seed)+1 for voter, row in BALLOTS.items() if voter != name}
        mean, deviation = statistics.mean(votes.values()), statistics.pstdev(votes.values())
        included = [rank for rank in votes.values() if abs(rank - mean) <= 1.5 * deviation]
        ratings.append(statistics.mean(included))
        details.append(dict(team=name, accepted=len(included), total=sum(included),
                            rejected={v: n for v, n in votes.items() if abs(n-mean) > 1.5*deviation}))
    assert sorted(ratings) == ratings and len(set(ratings)) == 16
    return ratings, details


def rank_rows(path):
    data = path.read_bytes()
    expected = json.loads((ROOT / "stage3_maps/inputs-snapshots.json").read_bytes())[VRS_DAY]
    assert hashlib.sha256(data).hexdigest() == expected
    rows = []
    for line in data.decode().splitlines():
        cells = [v.strip() for v in line.split("|")]
        if len(cells) >= 5 and cells[1].isdigit():
            roster = cells[4].split(", ")
            if len(set(map(key, roster))) == 5:
                rows.append(dict(name=cells[3], points=int(cells[2]), roster=roster, rank=int(cells[1])))
    return rows


def build_field(records, ranks):
    # Last independently observed lineups are known before the opening of Stage 2.
    history = sorted((r for r in records if "2025-01-01" <= utc_day(r) < START),
                     key=lambda r: int(r["date"]), reverse=True)
    teams = []
    for seed, name in enumerate(SEEDS, 1):
        for raw in history:
            if name not in (raw.get("team1"), raw.get("team2")):
                continue
            row = normalize(raw)
            if row:
                five = row["lineupA" if row["a"] == name else "lineupB"]
                if five:
                    break
        else:
            raise ValueError("No pre-stage five for " + name)
        assert set(map(key, ANNOUNCED[name].split())) == set(map(key, five)), name
        rank = ranking(five, ranks)
        teams.append(dict(name=name, seed=seed, roster=five, points=rank["points"], rank=rank["rank"],
                          ratingTeam=rank["name"], ratingRoster=rank["roster"], overlap=rank["overlap"],
                          rosterDay=row["day"], rosterSource=row["url"]))
    stage1 = [r for r in history if r.get("event") == EVENT+" Stage 1" and utc_day(r) >= "2025-03-01"]
    assert len(stage1) == 33
    wins = Counter(r["team1"] if r["team1score"] > r["team2score"] else r["team2"] for r in stage1)
    assert {n for n, w in wins.items() if w == 3} == set(SEEDS) - DIRECT
    ratings, details = ballot_ratings()
    return dict(id=ID, start=START, end=END, cutoff="2025-03-06T23:59:59Z", entrants=SEEDS, teams=teams,
                direct=[i for i, n in enumerate(SEEDS) if n in DIRECT], allBo3=True, ratingMargin="full",
                liveRatings=ratings, seedingDate="2025-03-06", seedingSource=SEED_SOURCE, ballotSource=VOTE_SOURCE,
                ballotRanksByVoter=BALLOTS, ballotCounts=details, pairingSource=RULES, rankingDate=VRS_DAY,
                fieldAnnouncement=dict(day="2025-03-06", source=ROSTER_SOURCE),
                rankingPublishedAt="2025-03-03T17:49:38Z", rankingSource=(
                    "https://github.com/ValveSoftware/counter-strike_regional_standings/blob/"+VRS_COMMIT+
                    "/invitation/2025/standings_global_2025_03_03.md"))


def replay(ratings, rounds):
    wins, losses, played = [0]*16, [0]*16, set()
    audit = []
    for i, games in enumerate(rounds):
        if i == 0:
            proposed = {(a, 15-a) for a in range(8)}
        else:
            groups = {}
            for t in range(16):
                if wins[t] < 3 and losses[t] < 3:
                    groups.setdefault((wins[t], losses[t]), []).append(t)
            proposed = {pair for group in groups.values() for pair in draw(group, ratings, played)}
        actual = {tuple(sorted((w, l))) for w, l, _ in games}
        audit.append(dict(round=i+1, expected=len(actual), matched=len(actual & proposed)))
        assert actual == proposed, (i+1, actual-proposed, proposed-actual)
        for w, l, _ in games:
            diff = ratings[w] - ratings[l]
            swing = 5 * (1 - 1 / (1 + 10**((diff-8)/10)))
            ratings[w] -= swing
            ratings[l] += swing
            wins[w] += 1
            losses[l] += 1
            played.add(tuple(sorted((w,l))))
    assert len(played) == 33
    return audit


def build_results(records, field):
    rounds, ids, matches = [[] for _ in range(5)], [[] for _ in range(5)], []
    for raw in sorted(records, key=lambda r: int(r["date"])):
        if raw.get("event") != EVENT or not START <= utc_day(raw) <= END:
            continue
        rd = int(re.search(r"Swiss round (\d)", raw["stage"])[1]) - 1
        g = normalize(raw)
        assert g and g["bo"] == 3
        for team, five in [(g["a"], g["lineupA"]), (g["b"], g["lineupB"])]:
            assert set(map(key, five)) == set(map(key, field["teams"][SEEDS.index(team)]["roster"])), team
        ai, bi = SEEDS.index(g["a"]), SEEDS.index(g["b"])
        sa, sb = raw["team1score"], raw["team2score"]
        assert max(sa, sb) == 2 and min(sa, sb) in (0, 1)
        w, l = (ai, bi) if sa > sb else (bi, ai)
        ids[rd].append(g["mid"])
        rounds[rd].append([w, l, min(sa,sb)])
        matches.append(dict(id=g["mid"], day=g["day"], round=rd+1, bo=3, a=g["a"], b=g["b"],
                            score=[sa, sb], maps=g["maps"], sourceUrl=g["url"]))
    assert list(map(len, rounds)) == [8,8,8,6,3] and len(set(sum(ids, []))) == 33
    return dict(id=ID, end=END, rounds=rounds, matchIds=ids, administrativeMatchIds=[], matches=matches,
                pairingReplay=replay(field["liveRatings"].copy(), rounds),
                source="https://www.hltv.org/results?event=8292", archiveSource=(
                    "https://github.com/zugzugs/hltvy/tree/"+ARCHIVE_COMMIT), archiveSha256=SHA256)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path, help="Folder with results.json.gz and standings_global_2025_03_03.md")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    archive = args.cache / "results.json.gz"
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA256
    with gzip.open(archive, "rt", encoding="utf8") as stream:
        records = json.load(stream)
    field = build_field(records, rank_rows(args.cache / "standings_global_2025_03_03.md"))
    truth = build_results(records, field)
    for name, data in (("field",field), ("results",truth)):
        p = HERE / ("epl21-" + name + ".json")
        if args.write:
            p.write_bytes((json.dumps(data, indent=2, ensure_ascii=False)+"\n").encode())
        else:
            assert json.loads(p.read_bytes()) == data
    print("EPL 21 Stage 2: 16 dated lineups; 33 played BO3; all five draws reproduced.")


if __name__ == "__main__":
    main()
